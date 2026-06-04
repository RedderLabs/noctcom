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

  // ─── GET /plans (público) ─────────────────────────────────
  app.get('/plans', async (_req, reply) => {
    return reply.send({ plans: publicPlans(), billingEnabled: !!stripe });
  });

  // ─── GET /status (auth) ───────────────────────────────────
  app.get('/status', { onRequest: [app.authenticate] }, async (req, reply) => {
    const r = await db.query(
      `SELECT plan, subscription_status, current_period_end, stripe_customer_id
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

    // Reutiliza el customer de Stripe del usuario si ya existe (no duplicar).
    const u = await db.query('SELECT stripe_customer_id FROM users WHERE id = $1', [req.user.sub]);
    if (u.rowCount === 0) return reply.notFound();
    let customerId: string | undefined = u.rows[0].stripe_customer_id ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({ metadata: { userId: req.user.sub } });
      customerId = customer.id;
      await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, req.user.sub]);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: req.user.sub,
      // Stripe Tax (IVA) si está activado en la cuenta.
      automatic_tax: { enabled: true },
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

  // Aplica el estado de la suscripción de Stripe al usuario: plan + cuota.
  async function handleEvent(event: Stripe.Event): Promise<void> {
    if (!stripe) return;

    // Resuelve el plan a partir de la suscripción (su price) y actualiza al user.
    async function applySubscription(sub: Stripe.Subscription): Promise<void> {
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const priceId = sub.items.data[0]?.price.id ?? '';
      const active = sub.status === 'active' || sub.status === 'trialing';
      const plan = active ? (planByStripePrice(priceId) ?? FREE_PLAN) : FREE_PLAN;
      const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

      await db.query(
        `UPDATE users SET
           plan = $1,
           storage_quota_bytes = $2,
           stripe_subscription_id = $3,
           subscription_status = $4,
           current_period_end = $5
         WHERE stripe_customer_id = $6`,
        [plan.id, plan.quotaBytes, sub.id, sub.status, periodEnd, customerId],
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
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        await applySubscription(event.data.object as Stripe.Subscription);
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
             subscription_status = 'canceled', stripe_subscription_id = NULL, current_period_end = NULL
           WHERE stripe_customer_id = $2`,
          [FREE_PLAN.quotaBytes, customerId],
        );
        break;
      }
      default:
        break; // otros eventos: ignorados
    }
  }
};

export default billingRoutes;
