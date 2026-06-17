/**
 * Desbloqueo "Tus discos" de por vida: helpers puros de plans.ts.
 * Cubre la disponibilidad según Stripe + price, el precio mostrado y el match
 * defensivo del priceId en el webhook. Sin DB ni Stripe reales.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlockPriceId, isUnlockPrice, unlockPriceEur, unlockInfo } from '../plans.js';

const ORIG = { ...process.env };

beforeEach(() => {
  delete process.env.STRIPE_PRICE_UNLOCK;
  delete process.env.UNLOCK_PRICE_EUR;
});
afterEach(() => {
  process.env = { ...ORIG };
});

describe('unlock helpers', () => {
  it('sin price configurado: no disponible y priceId null', () => {
    expect(unlockPriceId()).toBeNull();
    expect(unlockInfo(true).available).toBe(false); // Stripe activo pero sin price
    expect(unlockInfo(false).available).toBe(false);
  });

  it('con price + Stripe activo: disponible', () => {
    process.env.STRIPE_PRICE_UNLOCK = 'price_unlock_123';
    expect(unlockPriceId()).toBe('price_unlock_123');
    expect(unlockInfo(true).available).toBe(true);
    // Sin Stripe activo no se ofrece aunque haya price.
    expect(unlockInfo(false).available).toBe(false);
  });

  it('isUnlockPrice solo casa el price exacto', () => {
    process.env.STRIPE_PRICE_UNLOCK = 'price_unlock_123';
    expect(isUnlockPrice('price_unlock_123')).toBe(true);
    expect(isUnlockPrice('price_otra_cosa')).toBe(false);
    expect(isUnlockPrice('')).toBe(false);
  });

  it('isUnlockPrice es false si no hay price configurado (no casa "")', () => {
    expect(isUnlockPrice('')).toBe(false);
    expect(isUnlockPrice('price_x')).toBe(false);
  });

  it('precio mostrado: default 49, override válido, ignora basura', () => {
    expect(unlockPriceEur()).toBe(49);
    process.env.UNLOCK_PRICE_EUR = '79';
    expect(unlockPriceEur()).toBe(79);
    expect(unlockInfo(true).priceEur).toBe(79);
    process.env.UNLOCK_PRICE_EUR = 'abc';
    expect(unlockPriceEur()).toBe(49);
    process.env.UNLOCK_PRICE_EUR = '-5';
    expect(unlockPriceEur()).toBe(49);
  });
});
