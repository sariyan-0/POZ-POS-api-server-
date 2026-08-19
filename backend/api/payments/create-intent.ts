import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { authenticatePosApiKey } from "../../lib/auth";
import { applySecurityHeaders, requireMethod } from "../../lib/http";
import { sendError, sendSuccess } from "../../lib/responses";
import {
  buildCreatePaymentIntentParams,
  normalizePaymentIntent,
  validateCreatePaymentIntentInput,
} from "../../lib/payments";
import { getStripeClient } from "../../lib/stripe";

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

  const validation = validateCreatePaymentIntentInput(req.body);
  if (!validation.ok) {
    return sendError(res, 400, "BAD_REQUEST", validation.message);
  }

  try {
    const stripe = getStripeClient();
    const paymentIntent = await stripe.paymentIntents.create(
      buildCreatePaymentIntentParams(validation.value),
      {
        idempotencyKey: validation.value.idempotencyKey,
      },
    );

    return sendSuccess(res, 200, {
      paymentIntent: normalizePaymentIntent(paymentIntent),
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
      return sendError(
        res,
        400,
        "BAD_REQUEST",
        "Stripe rejected the PaymentIntent request.",
      );
    }

    return sendError(
      res,
      502,
      "STRIPE_UNAVAILABLE",
      "Unable to create PaymentIntent.",
    );
  }
}
