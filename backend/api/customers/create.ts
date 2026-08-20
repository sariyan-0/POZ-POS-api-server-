import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { authenticatePosApiKey } from "../../lib/auth";
import {
  createOrReuseStripeCustomer,
  normalizeCustomer,
  validateCreateCustomerInput,
} from "../../lib/customers";
import { applySecurityHeaders, requireMethod } from "../../lib/http";
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

  const validation = validateCreateCustomerInput(req.body);
  if (!validation.ok) {
    return sendError(res, 400, "BAD_REQUEST", validation.message);
  }

  try {
    const stripe = getStripeClient();
    const customer = await createOrReuseStripeCustomer(stripe, validation.value);

    return sendSuccess(res, 200, {
      customer: normalizeCustomer(customer),
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
      logStripeError("customers.create.invalid_request", error, {
        localCustomerId: validation.value.localCustomerId ?? null,
        email: validation.value.email ?? null,
        phone: validation.value.phone ?? null,
      });

      return sendError(
        res,
        400,
        "BAD_REQUEST",
        diagnostics?.message ?? "Stripe rejected the customer request.",
        {
          stripeCode: diagnostics?.code ?? null,
          stripeDeclineCode: diagnostics?.declineCode ?? null,
          stripeParam: diagnostics?.param ?? null,
          requestId: diagnostics?.requestId ?? null,
        },
      );
    }

    logStripeError("customers.create.unhandled", error, {
      localCustomerId: validation.value.localCustomerId ?? null,
      email: validation.value.email ?? null,
      phone: validation.value.phone ?? null,
    });

    return sendError(
      res,
      502,
      "STRIPE_UNAVAILABLE",
      "Unable to create customer.",
    );
  }
}
