// Catálogo de planes del almacenamiento cloud gestionado. Fuente de la verdad
// del precio y de la cuota (bytes). El self-host NO usa esto (es gratis, AGPL).
//
// Precios decididos (mensuales): 1 GB gratis · 10 GB 1€ · 50 GB 2€ · 200 GB 5€ ·
// 1 TB 10€. El webhook de Stripe mapea price_id → planId → quotaBytes.

export interface Plan {
  id: string;
  label: string;
  quotaBytes: number;
  priceEurMonth: number; // 0 = gratis
  // ID de precio en Stripe (env STRIPE_PRICE_<ID>). Vacío en el plan free.
  stripePriceEnv?: string;
}

const GB = 1024 ** 3;

export const PLANS: Plan[] = [
  { id: 'free', label: 'Gratis', quotaBytes: 1 * GB, priceEurMonth: 0 },
  { id: 'starter', label: '10 GB', quotaBytes: 10 * GB, priceEurMonth: 1, stripePriceEnv: 'STRIPE_PRICE_STARTER' },
  { id: 'plus', label: '50 GB', quotaBytes: 50 * GB, priceEurMonth: 2, stripePriceEnv: 'STRIPE_PRICE_PLUS' },
  { id: 'pro', label: '200 GB', quotaBytes: 200 * GB, priceEurMonth: 5, stripePriceEnv: 'STRIPE_PRICE_PRO' },
  { id: 'max', label: '1 TB', quotaBytes: 1024 * GB, priceEurMonth: 10, stripePriceEnv: 'STRIPE_PRICE_MAX' },
];

export const FREE_PLAN = PLANS[0]!;

export function planById(id: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === id) ?? FREE_PLAN;
}

// Resuelve el priceId real de Stripe de un plan (desde el entorno). Devuelve
// null si el plan es gratis o si no hay price configurado.
export function stripePriceId(plan: Plan): string | null {
  if (!plan.stripePriceEnv) return null;
  return process.env[plan.stripePriceEnv] || null;
}

// Mapea un priceId de Stripe de vuelta a su plan (para el webhook).
export function planByStripePrice(priceId: string): Plan | null {
  for (const p of PLANS) {
    if (p.stripePriceEnv && process.env[p.stripePriceEnv] === priceId) return p;
  }
  return null;
}

// ─── Tope de planes en modo de prueba ─────────────────────────────
// Mientras Stripe está en modo TEST (clave sk_test), una tarjeta de prueba
// permitiría "contratar" un plan grande sin pago real, pero generando coste real
// de almacenamiento (Backblaze). Por eso capamos qué planes se pueden contratar
// hasta tener el modo live. Tope por id, configurable con BILLING_TEST_MAX_PLAN
// (default: 'starter' = 10 GB). Free nunca pasa por checkout.
export function isBillingTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test');
}

export function planRank(id: string): number {
  const idx = PLANS.findIndex((p) => p.id === id);
  return idx >= 0 ? idx : 0;
}

function testMaxRank(): number {
  return planRank(process.env.BILLING_TEST_MAX_PLAN || 'starter');
}

// ¿Se puede contratar este plan AHORA? En modo live, cualquiera con price; en
// modo test, solo hasta el plan tope. (No incluye la comprobación de que Stripe
// esté activo / tenga price: eso se valida aparte.)
export function isPlanCheckoutAllowed(id: string): boolean {
  if (!isBillingTestMode()) return true;
  return planRank(id) <= testMaxRank();
}

// ─── Desbloqueo "Tus discos" de por vida (pago ÚNICO) ─────────────
// No es un "plan" (no da cuota de nube ni es suscripción): es un derecho
// ortogonal (users.agent_unlock) que habilita usar los discos propios vía
// Connector sin límite de discos y para siempre. Se cobra una sola vez con un
// Checkout de Stripe en mode=payment. A diferencia de un plan mensual, NO te
// expone a coste recurrente de almacenamiento (los blobs viven en TU disco).

// price ID one-time del desbloqueo (vacío = no se ofrece).
export function unlockPriceId(): string | null {
  return process.env.STRIPE_PRICE_UNLOCK || null;
}

// ¿Coincide un priceId con el del desbloqueo? (defensa extra en el webhook).
export function isUnlockPrice(priceId: string): boolean {
  const id = unlockPriceId();
  return !!id && id === priceId;
}

// Precio mostrado (€, pago único) para la UI. El cobro real lo fija Stripe.
export function unlockPriceEur(): number {
  const n = Number(process.env.UNLOCK_PRICE_EUR);
  return Number.isFinite(n) && n > 0 ? n : 49;
}

// Info pública del desbloqueo para /billing/plans. `available` exige Stripe
// activo + price configurado (en modo test se permite: el desbloqueo no otorga
// almacenamiento de nube, así que una tarjeta de prueba no genera coste real).
export function unlockInfo(stripeActive: boolean): {
  priceEur: number;
  available: boolean;
} {
  return {
    priceEur: unlockPriceEur(),
    available: stripeActive && !!unlockPriceId(),
  };
}
