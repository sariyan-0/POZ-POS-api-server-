import Stripe from "stripe";

export type CreateRefundInput = {
  paymentIntentId: string;
  amount?: number;
  idempotencyKey: string;
};

export type NormalizedRefund = {
  id: string;
  paymentIntentId: string | null;
  amount: number;
  currency: string;
  status: string | null;
};

type ValidationResult =
  | { ok: true; value: CreateRefundInput }
  | { ok: false; message: string };

type RefundEligibility =
  | {
      ok: true;
      paymentIntent: Stripe.PaymentIntent;
      latestCharge: Stripe.Charge;
      refundableAmount: number;
    }
  | {
      ok: false;
      code:
        | "PAYMENT_NOT_FOUND"
        | "PAYMENT_NOT_COMPLETED"
        | "REFUND_AMOUNT_EXCEEDED"
        | "IN_PERSON_REFUND_REQUIRED";
      message: string;
      refundableAmount?: number;
      currency?: string;
    };

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isLikelyPaymentIntentId(value: string): boolean {
  return /^pi_[A-Za-z0-9]+$/.test(value);
}

export function validateCreateRefundInput(body: unknown): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const payload = body as Record<string, unknown>;
  const paymentIntentId = asTrimmedString(payload.paymentIntentId);
  if (!paymentIntentId) {
    return { ok: false, message: "paymentIntentId is required." };
  }

  if (!isLikelyPaymentIntentId(paymentIntentId)) {
    return { ok: false, message: "paymentIntentId must be a valid Stripe PaymentIntent ID." };
  }

  const idempotencyKey = asTrimmedString(payload.idempotencyKey);
  if (!idempotencyKey) {
    return { ok: false, message: "idempotencyKey is required." };
  }

  if (idempotencyKey.length > 255) {
    return { ok: false, message: "idempotencyKey is too long." };
  }

  const amount = payload.amount;
  if (typeof amount === "undefined" || amount === null) {
    return {
      ok: true,
      value: {
        paymentIntentId,
        idempotencyKey,
      },
    };
  }

  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return { ok: false, message: "amount must be a number." };
  }

  if (!Number.isInteger(amount)) {
    return { ok: false, message: "amount must be an integer in the smallest currency unit." };
  }

  if (amount <= 0) {
    return { ok: false, message: "amount must be greater than zero." };
  }

  return {
    ok: true,
    value: {
      paymentIntentId,
      amount,
      idempotencyKey,
    },
  };
}

function asCharge(value: string | Stripe.Charge | null): Stripe.Charge | null {
  if (!value || typeof value === "string") {
    return null;
  }

  return value;
}

function isInteracCharge(charge: Stripe.Charge): boolean {
  return charge.payment_method_details?.type === "interac_present";
}

export async function getRefundEligibility(
  stripe: Stripe,
  input: CreateRefundInput,
): Promise<RefundEligibility> {
  const paymentIntent = await stripe.paymentIntents.retrieve(input.paymentIntentId, {
    expand: ["latest_charge"],
  });

  const latestCharge = asCharge(paymentIntent.latest_charge);
  if (!latestCharge) {
    return {
      ok: false,
      code: "PAYMENT_NOT_FOUND",
      message: "PaymentIntent does not have a captured charge to refund.",
    };
  }

  if (paymentIntent.status !== "succeeded") {
    return {
      ok: false,
      code: "PAYMENT_NOT_COMPLETED",
      message: "Only succeeded payments can be refunded.",
    };
  }

  if (isInteracCharge(latestCharge)) {
    return {
      ok: false,
      code: "IN_PERSON_REFUND_REQUIRED",
      message:
        "Interac refunds in Canada must be processed in person on a Stripe Terminal reader with the original card presented.",
      refundableAmount: latestCharge.amount - latestCharge.amount_refunded,
      currency: latestCharge.currency,
    };
  }

  const refundableAmount = latestCharge.amount - latestCharge.amount_refunded;
  if (refundableAmount <= 0) {
    return {
      ok: false,
      code: "REFUND_AMOUNT_EXCEEDED",
      message: "Payment has no remaining refundable amount.",
      refundableAmount,
      currency: latestCharge.currency,
    };
  }

  if (typeof input.amount === "number" && input.amount > refundableAmount) {
    return {
      ok: false,
      code: "REFUND_AMOUNT_EXCEEDED",
      message: "amount exceeds the remaining refundable amount.",
      refundableAmount,
      currency: latestCharge.currency,
    };
  }

  return {
    ok: true,
    paymentIntent,
    latestCharge,
    refundableAmount,
  };
}

export function buildCreateRefundParams(
  input: CreateRefundInput,
): Stripe.RefundCreateParams {
  return {
    payment_intent: input.paymentIntentId,
    ...(typeof input.amount === "number" ? { amount: input.amount } : {}),
  };
}

export function normalizeRefund(refund: Stripe.Refund): NormalizedRefund {
  return {
    id: refund.id,
    paymentIntentId:
      typeof refund.payment_intent === "string" ? refund.payment_intent : null,
    amount: refund.amount,
    currency: refund.currency,
    status: refund.status,
  };
}
