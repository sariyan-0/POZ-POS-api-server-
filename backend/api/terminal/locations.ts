import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { authenticatePosApiKey } from "../../lib/auth";
import { applySecurityHeaders } from "../../lib/http";
import { sendError, sendSuccess } from "../../lib/responses";
import { getStripeClient } from "../../lib/stripe";
import {
  buildCreateTerminalLocationParams,
  normalizeTerminalLocation,
  validateCreateTerminalLocationInput,
} from "../../lib/terminalLocations";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse | void> {
  applySecurityHeaders(res);

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return sendError(
      res,
      405,
      "METHOD_NOT_ALLOWED",
      `Method ${req.method ?? "UNKNOWN"} not allowed.`,
    );
  }

  if (!authenticatePosApiKey(req, res)) {
    return;
  }

  try {
    if (req.method === "GET") {
      const stripe = getStripeClient();
      const locations = await stripe.terminal.locations.list({ limit: 100 });
      return sendSuccess(res, 200, {
        locations: locations.data.map(normalizeTerminalLocation),
      });
    }

    const validation = validateCreateTerminalLocationInput(req.body);
    if (!validation.ok) {
      return sendError(res, 400, "BAD_REQUEST", validation.message);
    }

    const stripe = getStripeClient();
    const createdLocation = await stripe.terminal.locations.create(
      buildCreateTerminalLocationParams(validation.value),
    );

    return sendSuccess(res, 200, {
      location: normalizeTerminalLocation(createdLocation),
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
        "Stripe rejected the Terminal Location request.",
      );
    }

    return sendError(
      res,
      502,
      "STRIPE_UNAVAILABLE",
      "Unable to process Terminal Location request.",
    );
  }
}
