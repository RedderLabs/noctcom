'use client';

import { apiFetch } from './api';

export interface PublicPlan {
  id: string;
  label: string;
  quotaBytes: number;
  priceEurMonth: number;
  available: boolean;
}

export interface BillingStatus {
  billingEnabled: boolean;
  plan: string;
  planLabel: string;
  quotaBytes: number;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  hasCustomer: boolean;
}

// Catálogo público (no requiere sesión).
export async function fetchPlans(): Promise<{ plans: PublicPlan[]; billingEnabled: boolean }> {
  return apiFetch('/api/v1/billing/plans', { skipAuth: true });
}

export async function fetchBillingStatus(): Promise<BillingStatus> {
  return apiFetch('/api/v1/billing/status');
}

// Inicia el pago de un plan: redirige a Stripe Checkout.
export async function startCheckout(planId: string): Promise<void> {
  const { url } = await apiFetch<{ url: string }>('/api/v1/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ planId }),
  });
  if (url) window.location.href = url;
}

// Abre el portal de cliente de Stripe (gestionar/cancelar).
export async function openBillingPortal(): Promise<void> {
  const { url } = await apiFetch<{ url: string }>('/api/v1/billing/portal', { method: 'POST' });
  if (url) window.location.href = url;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(bytes % 1024 ** 4 === 0 ? 0 : 1)} TB`;
  if (bytes >= 1024 ** 3) return `${Math.round(bytes / 1024 ** 3)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
