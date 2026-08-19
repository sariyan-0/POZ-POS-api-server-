import Stripe from "stripe";

export const SUPPORTED_PAYMENT_CURRENCY = "cad";
export const MAX_PAYMENT_AMOUNT = 1_000_000;

export type CreatePaymentIntentInput = {
  amount: number;
  currency: "cad";
  idempotencyKey: string;
};

export type NormalizedPaymentIntent = {
  id: string;
  clientSecret: string | null;
  amount: number;
  currency: string;
  status: Stripe.PaymentIntent.Status;
};

type ValidationResult =
  | { ok: true; value: CreatePaymentIntentInput }
  | { ok: false; message: string };

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateCreatePaymentIntentInput(
  body: unknown,
): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const payload = body as Record<string, unknown>;
  const amount = payload.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return { ok: false, message: "amount must be a number." };
  }

  if (!Number.isInteger(amount)) {
    return { ok: false, message: "amount must be an integer in the smallest currency unit." };
  }

  if (amount <= 0) {
    return { ok: false, message: "amount must be greater than zero." };
  }

  if (amount > MAX_PAYMENT_AMOUNT) {
    return { ok: false, message: "amount exceeds the maximum allowed value." };
  }

  const normalizedCurrency = asTrimmedString(payload.currency)?.toLowerCase();
  if (normalizedCurrency !== SUPPORTED_PAYMENT_CURRENCY) {
    return { ok: false, message: "currency must be cad." };
  }

  const idempotencyKey = asTrimmedString(payload.idempotencyKey);
  if (!idempotencyKey) {
    return { ok: false, message: "idempotencyKey is required." };
  }

  if (idempotencyKey.length > 255) {
    return { ok: false, message: "idempotencyKey is too long." };
  }

  return {
    ok: true,
    value: {
      amount,
      currency: SUPPORTED_PAYMENT_CURRENCY,
      idempotencyKey,
    },
  };
}

export function buildCreatePaymentIntentParams(
  input: CreatePaymentIntentInput,
): Stripe.PaymentIntentCreateParams {
  const params = {
    amount: input.amount,
    currency: input.currency,
    payment_method_types: ["card_present", "interac_present"],
    payment_method_options: {
      card_present: {
        capture_method: "manual_preferred",
      },
    },
  };

  // Stripe's current Terminal Canada docs require `manual_preferred` here
  // when combining `card_present` with `interac_present`, but the installed
  // stripe-node typings have not caught up with that field yet.
  return params as Stripe.PaymentIntentCreateParams;
}

export function normalizePaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
): NormalizedPaymentIntent {
  return {
    id: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: paymentIntent.status,
  };
}
