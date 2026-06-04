/**
 * Billing con Stripe (Fase 8). Inactivo si no hay STRIPE_SECRET_KEY: los
 * endpoints responden 503 y la UI no ofrece upgrade. El cobro va atado a la
 * CUOTA (bytes), nunca al contenido (zero-knowledge intacto).
 *
 * Rutas:
 *   GET  /plans            — catálogo público (planes + precios + disponibilidad)
 *   GET  /status           — plan actual del usuario (auth)
 *   POST /checkout         — crea Checkout Session para un plan (auth) → url
 *   POST /portal           — abre el portal de cliente de Stripe (auth) → url
 *   POST /webhook          — eventos de Stripe (sin auth, firma verificada, raw body)
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import Stripe from 'stripe';
import { db } from '../db/pool.js';
import { env } from '../config.js';
import { PLANS, FREE_PLAN, planById, stripePriceId, planByStripePrice } from '../plans.js';
import {
  sendPlanActiveEmail, sendPlanCanceledScheduledEmail,
  sendPaymentFailedEmail, sendPlanEndedEmail,
} from '../mail.js';

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

function publicPlans() {
  return PLANS.map((p) => ({
    id: p.id,
    label: p.label,
    quotaBytes: p.quotaBytes,
    priceEurMonth: p.priceEurMonth,
    // Un plan de pago solo es "comprable" si Stripe está activo y tiene price.
    available: p.priceEurMonth === 0 || (!!stripe && !!stripePriceId(p)),
  }));
}

const billingRoutes: FastifyPluginAsync = async (app) => {
  const FRONTEND = env.FRONTEND_URL ?? 'https://noctcom.com';

  // Devuelve un customer VÁLIDO en la cuenta de Stripe actual. Si el guardado no
  // existe (p. ej. se cambió de cuenta de Stripe), crea uno nuevo y lo persiste,
  // en vez de fallar con "No such customer".
  async function ensureCustomer(userId: string, storedId: string | null): Promise<string> {
    if (storedId) {
      try {
        const c = await stripe!.customers.retrieve(storedId);
        if (!(c as { deleted?: boolean }).deleted) return storedId;
      } catch { /* no existe en esta cuenta → se recrea abajo */ }
    }
    const customer = await stripe!.customers.create({ metadata: { userId } });
    await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customer.id, userId]);
    return customer.id;
  }

  // ─── GET /plans (público) ─────────────────────────────────
  app.get('/plans', async (_req, reply) => {
    return reply.send({ plans: publicPlans(), billingEnabled: !!stripe });
  });

  // ─── GET /status (auth) ───────────────────────────────────
  app.get('/status', { onRequest: [app.authenticate] }, async (req, reply) => {
    const r = await db.query(
      `SELECT plan, subscription_status, current_period_end, cancel_at_period_end, stripe_customer_id
       FROM users WHERE id = $1`,
      [req.user.sub],
    );
    if (r.rowCount === 0) return reply.notFound();
    const u = r.rows[0];
    const plan = planById(u.plan);
    return reply.send({
      billingEnabled: !!stripe,
      plan: plan.id,
      planLabel: plan.label,
      quotaBytes: plan.quotaBytes,
      subscriptionStatus: u.subscription_status ?? null,
      currentPeriodEnd: u.current_period_end ?? null,
      cancelAtPeriodEnd: !!u.cancel_at_period_end,
      hasCustomer: !!u.stripe_customer_id,
    });
  });

  // ─── POST /checkout (auth) — comprar/cambiar de plan ──────
  app.post('/checkout', { onRequest: [app.authenticate] }, async (req, reply) => {
    if (!stripe) return reply.code(503).send({ error: 'billing-disabled' });
    const { planId } = z.object({ planId: z.string() }).parse(req.body);

    const plan = planById(planId);
    if (plan.id === FREE_PLAN.id) return reply.badRequest('el plan gratuito no requiere pago');
    const priceId = stripePriceId(plan);
    if (!priceId) return reply.badRequest('plan no disponible para compra');

    const u = await db.query(
      'SELECT stripe_customer_id, stripe_subscription_id, subscription_status FROM users WHERE id = $1',
      [req.user.sub],
    );
    if (u.rowCount === 0) return reply.notFound();
    const row = u.rows[0];

    // Si YA tiene una suscripción activa, NO se crea otra (seria doble cobro):
    // se ACTUALIZA la existente al nuevo precio, con prorrateo. Cambio
    // instantaneo; el webhook customer.subscription.updated ajusta la cuota.
    const hasActive = row.stripe_subscription_id
      && (row.subscription_status === 'active' || row.subscription_status === 'trialing');
    if (hasActive) {
      const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      const itemId = sub.items.data[0]?.id;
      if (!itemId) return reply.badRequest('la suscripción no tiene líneas');
      if (sub.items.data[0]?.price.id === priceId) {
        return reply.send({ updated: true, unchanged: true }); // ya está en ese plan
      }
      await stripe.subscriptions.update(row.stripe_subscription_id, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: 'create_prorations',
      });
      return reply.send({ updated: true });
    }

    const customerId = await ensureCustomer(req.user.sub, row.stripe_customer_id);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: req.user.sub,
      // Stripe Tax (IVA): solo si STRIPE_AUTOMATIC_TAX=true (requiere códigos de
      // impuesto en los productos). Apagado por defecto → el primer test no falla.
      automatic_tax: { enabled: env.STRIPE_AUTOMATIC_TAX === 'true' },
      success_url: `${FRONTEND}/vault/settings?billing=success`,
      cancel_url: `${FRONTEND}/precios?billing=cancel`,
    });
    return reply.send({ url: session.url });
  });

  // ─── POST /portal (auth) — gestionar/cancelar suscripción ─
  app.post('/portal', { onRequest: [app.authenticate] }, async (req, reply) => {
    if (!stripe) return reply.code(503).send({ error: 'billing-disabled' });
    const u = await db.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.sub]);
    if (u.rowCount === 0 || !u.rows[0].stripe_customer_id) {
      return reply.badRequest('sin suscripción que gestionar');
    }
    const portal = await stripe.billingPortal.sessions.create({
      customer: u.rows[0].stripe_customer_id,
      return_url: `${FRONTEND}/vault/settings`,
    });
    return reply.send({ url: portal.url });
  });

  // ─── POST /webhook — eventos de Stripe ────────────────────
  // Necesita el cuerpo CRUDO para verificar la firma, así que va en un sub-scope
  // con su propio parser de bytes (no afecta a las rutas JSON de arriba).
  app.register(async (webhookScope) => {
    webhookScope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => done(null, body),
    );

    webhookScope.post('/webhook', async (req, reply) => {
      if (!stripe || !env.STRIPE_WEBHOOK_SECRET) return reply.code(503).send({ error: 'billing-disabled' });

      const sig = req.headers['stripe-signature'];
      if (typeof sig !== 'string') return reply.badRequest('sin firma');

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body as Buffer, sig, env.STRIPE_WEBHOOK_SECRET);
      } catch (err: any) {
        app.log.warn({ err: err?.message }, 'webhook de Stripe con firma inválida');
        return reply.badRequest('firma inválida');
      }

      // Idempotencia: si ya procesamos este evento, salimos OK.
      const seen = await db.query(
        `INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
        [event.id, event.type],
      );
      if (seen.rowCount === 0) return reply.send({ received: true, duplicate: true });

      try {
        await handleEvent(event);
      } catch (err) {
        app.log.error({ err, eventType: event.type }, 'fallo procesando webhook de Stripe');
        // 500 → Stripe reintenta; el evento ya está en stripe_events pero el
        // estado quizá no se aplicó. Lo borramos para permitir el reintento.
        await db.query('DELETE FROM stripe_events WHERE id = $1', [event.id]);
        return reply.code(500).send({ error: 'processing-failed' });
      }
      return reply.send({ received: true });
    });
  });

  // Email del cliente desde Stripe (no se almacena en Noctcom: zero-knowledge).
  async function getCustomerEmail(customerId: string): Promise<string | null> {
    try {
      const c = await stripe!.customers.retrieve(customerId);
      if ((c as { deleted?: boolean }).deleted) return null;
      return (c as Stripe.Customer).email ?? null;
    } catch { return null; }
  }

  // Envía un email sin que un fallo rompa el webhook (Stripe no debe reintentar
  // por un email caído). Fire-and-forget con log.
  function mailSafe(p: Promise<void>): void {
    p.catch((err) => app.log.warn({ err }, 'email de billing falló'));
  }

  // Aplica el estado de la suscripción de Stripe al usuario: plan + cuota.
  async function handleEvent(event: Stripe.Event): Promise<void> {
    if (!stripe) return;

    function periodEndOf(sub: Stripe.Subscription): Date | null {
      // En la API nueva, current_period_end vive en la línea, no en la suscripción.
      const u = (sub as { current_period_end?: number }).current_period_end
        ?? (sub.items.data[0] as { current_period_end?: number } | undefined)?.current_period_end
        ?? null;
      return u ? new Date(u * 1000) : null;
    }

    // Resuelve el plan a partir de la suscripción (su price) y actualiza al user.
    async function applySubscription(sub: Stripe.Subscription): Promise<void> {
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const priceId = sub.items.data[0]?.price.id ?? '';
      const active = sub.status === 'active' || sub.status === 'trialing';
      const plan = active ? (planByStripePrice(priceId) ?? FREE_PLAN) : FREE_PLAN;
      await db.query(
        `UPDATE users SET
           plan = $1, storage_quota_bytes = $2, stripe_subscription_id = $3,
           subscription_status = $4, current_period_end = $5, cancel_at_period_end = $6
         WHERE stripe_customer_id = $7`,
        [plan.id, plan.quotaBytes, sub.id, sub.status, periodEndOf(sub), !!sub.cancel_at_period_end, customerId],
      );
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            typeof session.subscription === 'string' ? session.subscription : session.subscription.id,
          );
          await applySubscription(sub);
          // Email de bienvenida al plan (primera compra).
          const plan = planByStripePrice(sub.items.data[0]?.price.id ?? '') ?? FREE_PLAN;
          const email = await getCustomerEmail(typeof sub.customer === 'string' ? sub.customer : sub.customer.id);
          if (email && plan.id !== FREE_PLAN.id) {
            mailSafe(sendPlanActiveEmail(email, plan.label, plan.label));
          }
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        // Estado previo para detectar transiciones (cancelación / cambio de plan).
        const prev = await db.query(
          'SELECT plan, cancel_at_period_end FROM users WHERE stripe_customer_id = $1',
          [customerId],
        );
        const prevPlan = prev.rows[0]?.plan ?? 'free';
        const prevCancel = !!prev.rows[0]?.cancel_at_period_end;

        await applySubscription(sub);

        const newPlan = planByStripePrice(sub.items.data[0]?.price.id ?? '') ?? FREE_PLAN;
        const email = await getCustomerEmail(customerId);
        if (email) {
          if (!prevCancel && sub.cancel_at_period_end) {
            // Cancelación recién programada → avisa de cuándo vuelve a free.
            mailSafe(sendPlanCanceledScheduledEmail(email, newPlan.label, periodEndOf(sub)));
          } else if (!sub.cancel_at_period_end && prevPlan !== newPlan.id && newPlan.id !== FREE_PLAN.id) {
            // Cambio de plan (p. ej. upgrade in-app) → confirma el nuevo plan.
            mailSafe(sendPlanActiveEmail(email, newPlan.label, newPlan.label));
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        // Cancelada → vuelve a free. NO borramos datos: si excede la cuota, queda
        // en solo-lectura (el enforcement de subida lo impide), pero conserva y
        // puede descargar/exportar. Coherente con ZK (no podemos borrar selectivo).
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        await db.query(
          `UPDATE users SET plan = 'free', storage_quota_bytes = $1,
             subscription_status = 'canceled', stripe_subscription_id = NULL,
             current_period_end = NULL, cancel_at_period_end = FALSE
           WHERE stripe_customer_id = $2`,
          [FREE_PLAN.quotaBytes, customerId],
        );
        const email = await getCustomerEmail(customerId);
        if (email) mailSafe(sendPlanEndedEmail(email));
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
        if (customerId) {
          const r = await db.query('SELECT plan FROM users WHERE stripe_customer_id = $1', [customerId]);
          const planLabel = planById(r.rows[0]?.plan).label;
          const email = await getCustomerEmail(customerId);
          if (email) mailSafe(sendPaymentFailedEmail(email, planLabel));
        }
        break;
      }
      default:
        break; // otros eventos: ignorados
    }
  }
};

export default billingRoutes;
