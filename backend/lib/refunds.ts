import Stripe from "stripe";

export type CreateRefundInput = {
  paymentIntentId?: string;
  chargeId?: string;
  amount?: number;
  currency: string;
  reason: string;
  note?: string;
  idempotencyKey?: string;
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
      paymentIntent?: Stripe.PaymentIntent;
      charge: Stripe.Charge;
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

function isLikelyChargeId(value: string): boolean {
  return /^ch_[A-Za-z0-9]+$/.test(value);
}

export function validateCreateRefundInput(body: unknown): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const payload = body as Record<string, unknown>;
  const paymentIntentId = asTrimmedString(payload.paymentIntentId);
  const chargeId = asTrimmedString(payload.chargeId);
  if (!paymentIntentId && !chargeId) {
    return {
      ok: false,
      message: "Either paymentIntentId or chargeId is required.",
    };
  }

  if (paymentIntentId && !isLikelyPaymentIntentId(paymentIntentId)) {
    return {
      ok: false,
      message: "paymentIntentId must be a valid Stripe PaymentIntent ID.",
    };
  }

  if (chargeId && !isLikelyChargeId(chargeId)) {
    return {
      ok: false,
      message: "chargeId must be a valid Stripe Charge ID.",
    };
  }

  const currencyValue = asTrimmedString(payload.currency);
  const currency = currencyValue ? currencyValue.toLowerCase() : undefined;
  if (!currency) {
    return { ok: false, message: "currency is required." };
  }

  const reason = asTrimmedString(payload.reason);
  if (!reason) {
    return { ok: false, message: "reason is required." };
  }

  const note = asTrimmedString(payload.note) ?? undefined;
  const idempotencyKey = asTrimmedString(payload.idempotencyKey) ?? undefined;
  if (idempotencyKey && idempotencyKey.length > 255) {
    return { ok: false, message: "idempotencyKey is too long." };
  }

  const amount = payload.amount;
  if (typeof amount === "undefined" || amount === null) {
    return {
      ok: true,
      value: {
        paymentIntentId: paymentIntentId ?? undefined,
        chargeId: chargeId ?? undefined,
        currency,
        reason,
        note,
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
      paymentIntentId: paymentIntentId ?? undefined,
      chargeId: chargeId ?? undefined,
      amount,
      currency,
      reason,
      note,
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

async function getChargeForRefund(
  stripe: Stripe,
  input: CreateRefundInput,
): Promise<
  | { ok: true; paymentIntent?: Stripe.PaymentIntent; charge: Stripe.Charge }
  | {
      ok: false;
      code: "PAYMENT_NOT_FOUND";
      message: string;
    }
> {
  if (input.paymentIntentId) {
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

    return {
      ok: true,
      paymentIntent,
      charge: latestCharge,
    };
  }

  if (!input.chargeId) {
    return {
      ok: false,
      code: "PAYMENT_NOT_FOUND",
      message: "Unable to determine which charge to refund.",
    };
  }

  const charge = await stripe.charges.retrieve(input.chargeId);

  return {
    ok: true,
    charge,
  };
}

export async function getRefundEligibility(
  stripe: Stripe,
  input: CreateRefundInput,
): Promise<RefundEligibility> {
  const target = await getChargeForRefund(stripe, input);
  if (!target.ok) {
    return target;
  }

  if (target.paymentIntent && target.paymentIntent.status !== "succeeded") {
    return {
      ok: false,
      code: "PAYMENT_NOT_COMPLETED",
      message: "Only succeeded payments can be refunded.",
    };
  }

  if (target.charge.status !== "succeeded") {
    return {
      ok: false,
      code: "PAYMENT_NOT_COMPLETED",
      message: "Only succeeded payments can be refunded.",
    };
  }

  if (target.charge.currency.toLowerCase() !== input.currency) {
    return {
      ok: false,
      code: "REFUND_AMOUNT_EXCEEDED",
      message: "currency must match the original payment currency.",
      refundableAmount: target.charge.amount - target.charge.amount_refunded,
      currency: target.charge.currency,
    };
  }

  if (isInteracCharge(target.charge)) {
    return {
      ok: false,
      code: "IN_PERSON_REFUND_REQUIRED",
      message:
        "This payment requires an in-person Terminal refund.",
      refundableAmount: target.charge.amount - target.charge.amount_refunded,
      currency: target.charge.currency,
    };
  }

  const refundableAmount = target.charge.amount - target.charge.amount_refunded;
  if (refundableAmount <= 0) {
    return {
      ok: false,
      code: "REFUND_AMOUNT_EXCEEDED",
      message: "Payment has no remaining refundable amount.",
      refundableAmount,
      currency: target.charge.currency,
    };
  }

  if (typeof input.amount === "number" && input.amount > refundableAmount) {
    return {
      ok: false,
      code: "REFUND_AMOUNT_EXCEEDED",
      message: "amount exceeds the remaining refundable amount.",
      refundableAmount,
      currency: target.charge.currency,
    };
  }

  return {
    ok: true,
    paymentIntent: target.paymentIntent,
    charge: target.charge,
    refundableAmount,
  };
}

export function buildCreateRefundParams(
  input: CreateRefundInput,
): Stripe.RefundCreateParams {
  return {
    ...(input.paymentIntentId
      ? { payment_intent: input.paymentIntentId }
      : { charge: input.chargeId as string }),
    ...(typeof input.amount === "number" ? { amount: input.amount } : {}),
    metadata: {
      source: "PowersOfZeroPOS",
      reason: input.reason,
      ...(input.note ? { note: input.note } : {}),
    },
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
