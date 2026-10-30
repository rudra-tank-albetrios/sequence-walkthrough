// Config: every setting the demo reads from the environment, each with a default.

export interface Config {
  /** How long a stock hold lives in Redis before the cron gives it back. */
  reservationTtlSeconds: number;
  currency: string;
  shopName: string;
  port: number;
}

function numberFrom(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined && Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    reservationTtlSeconds: numberFrom(env.RESERVATION_TTL_SECONDS, 900),
    currency: env.CURRENCY ?? 'INR',
    shopName: env.SHOP_NAME ?? 'Sequence Walkthrough Demo Store',
    port: numberFrom(env.PORT, 8787),
  };
}
