import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { authenticatePosApiKey } from "../../lib/auth";
import { applySecurityHeaders, requireMethod } from "../../lib/http";
import {
  buildCreateRefundParams,
  getRefundEligibility,
  normalizeRefund,
  validateCreateRefundInput,
} from "../../lib/refunds";
import { sendError, sendSuccess } from "../../lib/responses";
import { getStripeClient } from "../../lib/stripe";
import { getStripeErrorDiagnostics, logStripeError } from "../../lib/stripeErrors";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse | void> {
  applySecurityHeaders(res);

  if (!requireMethod(req, res, "POST")) {
    return;
  }

  if (!authenticatePosApiKey(req, res)) {
    return;
  }

  const validation = validateCreateRefundInput(req.body);
  if (!validation.ok) {
    return sendError(res, 400, "BAD_REQUEST", validation.message);
  }

  try {
    const stripe = getStripeClient();
    const eligibility = await getRefundEligibility(stripe, validation.value);

    if (!eligibility.ok) {
      if (eligibility.code === "IN_PERSON_REFUND_REQUIRED") {
        return sendError(
          res,
          409,
          "IN_PERSON_REFUND_REQUIRED",
          eligibility.message,
        );
      }

      const statusCode =
        eligibility.code === "PAYMENT_NOT_FOUND" ? 404 : 400;

      return sendError(res, statusCode, "BAD_REQUEST", eligibility.message);
    }

    const refund = await stripe.refunds.create(
      buildCreateRefundParams(validation.value),
      {
        idempotencyKey: validation.value.idempotencyKey,
      },
    );

    return sendSuccess(res, 200, {
      refund: normalizeRefund(refund),
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeAuthenticationError) {
      return sendError(
        res,
        502,
        "STRIPE_UNAVAILABLE",
        "Unable to communicate with Stripe.",
      );
    }

    if (
      error instanceof Error &&
      error.message === "STRIPE_SECRET_KEY is not configured."
    ) {
      return sendError(
        res,
        500,
        "SERVER_MISCONFIGURED",
        "Stripe is not configured on the server.",
      );
    }

    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      const diagnostics = getStripeErrorDiagnostics(error);
      logStripeError("payments.refund.invalid_request", error, {
        paymentIntentId: validation.value.paymentIntentId,
        amount: validation.value.amount ?? null,
      });

      return sendError(
        res,
        400,
        "STRIPE_REFUND_ERROR",
        diagnostics?.message ?? "Stripe rejected the refund request.",
        {
          stripeCode: diagnostics?.code ?? null,
          stripeDeclineCode: diagnostics?.declineCode ?? null,
          stripeParam: diagnostics?.param ?? null,
          requestId: diagnostics?.requestId ?? null,
        },
      );
    }

    logStripeError("payments.refund.unhandled", error, {
      paymentIntentId: validation.value.paymentIntentId,
      amount: validation.value.amount ?? null,
    });

    return sendError(
      res,
      502,
      "STRIPE_UNAVAILABLE",
      "Unable to create refund.",
    );
  }
}
