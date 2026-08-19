import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { authenticatePosApiKey } from "../../lib/auth";
import { applySecurityHeaders, requireMethod } from "../../lib/http";
import { sendError, sendSuccess } from "../../lib/responses";
import { verifyStripeConnection } from "../../lib/stripe";

type StripeStatusResponseData = {
  connected: true;
  livemode: boolean;
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse | void> {
  applySecurityHeaders(res);

  if (!requireMethod(req, res, "GET")) {
    return;
  }

  if (!authenticatePosApiKey(req, res)) {
    return;
  }

  try {
    const data: StripeStatusResponseData = await verifyStripeConnection();
    return sendSuccess(res, 200, data);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeAuthenticationError) {
      return sendError(
        res,
        502,
        "STRIPE_UNAVAILABLE",
        "Unable to verify Stripe configuration.",
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

    return sendError(
      res,
      502,
      "STRIPE_UNAVAILABLE",
      "Unable to reach Stripe.",
    );
  }
}
