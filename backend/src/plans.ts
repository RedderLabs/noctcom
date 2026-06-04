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
