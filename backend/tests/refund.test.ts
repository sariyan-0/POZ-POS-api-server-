import test, { mock } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";

import refundHandler from "../api/payments/refund";
import { setStripeClientForTesting } from "../lib/stripe";

type MockRequest = {
  method: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
};

function createResponse() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let jsonBody: unknown;

  const response = {
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    status(code: number) {
      statusCode = code;
      return response;
    },
    json(body: unknown) {
      jsonBody = body;
      return response;
    },
  };

  return {
    response,
    get statusCode() {
      return statusCode;
    },
    get jsonBody() {
      return jsonBody;
    },
    getHeader(name: string) {
      return headers.get(name);
    },
  };
}

function createStripeClient(overrides?: {
  paymentIntent?: Partial<{
    id: string;
    status: string;
    latest_charge: Record<string, unknown> | string | null;
  }>;
  charge?: Partial<{
    id: string;
    status: string;
    amount: number;
    amount_refunded: number;
    currency: string;
    payment_method_details: Record<string, unknown>;
  }>;
  refundResult?: Partial<{
    id: string;
    payment_intent: string | null;
    amount: number;
    currency: string;
    status: string | null;
  }>;
  refundsCreateImpl?: (
    params: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => Promise<unknown>;
}) {
  const paymentIntentsRetrieveCalls: unknown[] = [];
  const refundsCreateCalls: Array<{
    params: Record<string, unknown>;
    options: Record<string, unknown>;
  }> = [];

  const paymentIntent = {
    id: "pi_test_123",
    status: "succeeded",
    latest_charge: {
      id: "ch_test_123",
      status: "succeeded",
      amount: 1254,
      amount_refunded: 0,
      currency: "cad",
      payment_method_details: {
        type: "card_present",
      },
    },
    ...overrides?.paymentIntent,
  };

  const charge = {
    id: "ch_test_123",
    status: "succeeded",
    amount: 1254,
    amount_refunded: 0,
    currency: "cad",
    payment_method_details: {
      type: "card_present",
    },
    ...overrides?.charge,
  };

  const refundResult = {
    id: "re_test_123",
    payment_intent: "pi_test_123",
    amount: 1254,
    currency: "cad",
    status: "succeeded",
    ...overrides?.refundResult,
  };

  return {
    client: {
      paymentIntents: {
        retrieve: async (...args: unknown[]) => {
          paymentIntentsRetrieveCalls.push(args);
          return paymentIntent;
        },
      },
      charges: {
        retrieve: async () => charge,
      },
      refunds: {
        create: async (
          params: Record<string, unknown>,
          options: Record<string, unknown>,
        ) => {
          refundsCreateCalls.push({ params, options });
          if (overrides?.refundsCreateImpl) {
            return overrides.refundsCreateImpl(params, options);
          }
          return refundResult;
        },
      },
    },
    paymentIntentsRetrieveCalls,
    refundsCreateCalls,
  };
}

test("refund endpoint rejects missing authentication", async () => {
  process.env.POS_API_KEY = "test-pos-key";
  setStripeClientForTesting(null);

  const res = createResponse();
  await refundHandler(
    {
      method: "POST",
      headers: {},
      body: {},
    } as never,
    res.response as never,
  );

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.jsonBody, {
    success: false,
    error: {
      code: "UNAUTHORIZED",
      message: "Invalid or missing POS API key.",
    },
  });
});

test("refund endpoint creates a valid partial refund and forwards idempotency key", async () => {
  process.env.POS_API_KEY = "test-pos-key";
  const stripeMock = createStripeClient({
    refundResult: {
      amount: 200,
      payment_intent: "pi_123abc",
    },
  });
  setStripeClientForTesting(stripeMock.client as never);

  const res = createResponse();
  await refundHandler(
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-pos-key",
      },
      body: {
        paymentIntentId: "pi_123abc",
        amount: 200,
        currency: "cad",
        reason: "Customer request",
        idempotencyKey: "refund-attempt-001",
      },
    } as never,
    res.response as never,
  );
  setStripeClientForTesting(null);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.jsonBody, {
    success: true,
    data: {
      refund: {
        id: "re_test_123",
        paymentIntentId: "pi_123abc",
        amount: 200,
        currency: "cad",
        status: "succeeded",
      },
    },
  });
  assert.deepEqual(stripeMock.refundsCreateCalls, [
    {
      params: {
        payment_intent: "pi_123abc",
        amount: 200,
        metadata: {
          source: "PowersOfZeroPOS",
          reason: "Customer request",
        },
      },
      options: {
        idempotencyKey: "refund-attempt-001",
      },
    },
  ]);
});

test("refund endpoint forwards the same idempotency key on repeated retries", async () => {
  process.env.POS_API_KEY = "test-pos-key";
  const stripeMock = createStripeClient();
  setStripeClientForTesting(stripeMock.client as never);

  const request = {
    method: "POST",
    headers: {
      authorization: "Bearer test-pos-key",
    },
    body: {
      paymentIntentId: "pi_123abc",
      amount: 200,
      currency: "cad",
      reason: "Customer request",
      idempotencyKey: "refund-attempt-retry-001",
    },
  };

  const firstRes = createResponse();
  await refundHandler(request as never, firstRes.response as never);

  const secondRes = createResponse();
  await refundHandler(request as never, secondRes.response as never);

  setStripeClientForTesting(null);

  assert.equal(firstRes.statusCode, 200);
  assert.equal(secondRes.statusCode, 200);
  assert.deepEqual(stripeMock.refundsCreateCalls, [
    {
      params: {
        payment_intent: "pi_123abc",
        amount: 200,
        metadata: {
          source: "PowersOfZeroPOS",
          reason: "Customer request",
        },
      },
      options: {
        idempotencyKey: "refund-attempt-retry-001",
      },
    },
    {
      params: {
        payment_intent: "pi_123abc",
        amount: 200,
        metadata: {
          source: "PowersOfZeroPOS",
          reason: "Customer request",
        },
      },
      options: {
        idempotencyKey: "refund-attempt-retry-001",
      },
    },
  ]);
});

test("refund endpoint rejects invalid PaymentIntent identifiers", async () => {
  process.env.POS_API_KEY = "test-pos-key";

  const res = createResponse();
  await refundHandler(
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-pos-key",
      },
      body: {
        paymentIntentId: "bad_id",
        currency: "cad",
        reason: "Customer request",
        idempotencyKey: "refund-attempt-002",
      },
    } as never,
    res.response as never,
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonBody, {
    success: false,
    error: {
      code: "BAD_REQUEST",
      message: "paymentIntentId must be a valid Stripe PaymentIntent ID.",
    },
  });
});

test("refund endpoint rejects invalid amount types", async () => {
  process.env.POS_API_KEY = "test-pos-key";
  setStripeClientForTesting(null);

  const res = createResponse();
  await refundHandler(
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-pos-key",
      },
      body: {
        paymentIntentId: "pi_123abc",
        amount: "200",
        currency: "cad",
        reason: "Customer request",
        idempotencyKey: "refund-attempt-003",
      },
    } as never,
    res.response as never,
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonBody, {
    success: false,
    error: {
      code: "BAD_REQUEST",
      message: "amount must be a number.",
    },
  });
});

test("refund endpoint rejects non-positive amounts", async () => {
  process.env.POS_API_KEY = "test-pos-key";
  setStripeClientForTesting(null);

  const res = createResponse();
  await refundHandler(
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-pos-key",
      },
      body: {
        paymentIntentId: "pi_123abc",
        amount: 0,
        currency: "cad",
        reason: "Customer request",
        idempotencyKey: "refund-attempt-004",
      },
    } as never,
    res.response as never,
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonBody, {
    success: false,
    error: {
      code: "BAD_REQUEST",
      message: "amount must be greater than zero.",
    },
  });
});

test("refund endpoint returns safe Stripe rejection details", async () => {
  process.env.POS_API_KEY = "test-pos-key";
  const stripeMock = createStripeClient({
    refundsCreateImpl: async () => {
      throw new Stripe.errors.StripeInvalidRequestError({
        message: "Refund amount is greater than remaining amount.",
        type: "invalid_request_error",
        code: "amount_too_large",
        param: "amount",
        requestId: "req_refund_123",
      } as never);
    },
  });
  setStripeClientForTesting(stripeMock.client as never);

  const res = createResponse();
  await refundHandler(
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-pos-key",
      },
      body: {
        paymentIntentId: "pi_123abc",
        amount: 200,
        currency: "cad",
        reason: "Customer request",
        idempotencyKey: "refund-attempt-005",
      },
    } as never,
    res.response as never,
  );
  setStripeClientForTesting(null);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonBody, {
    success: false,
    error: {
      code: "STRIPE_REFUND_ERROR",
      message: "Refund amount is greater than remaining amount.",
      stripeCode: "amount_too_large",
      stripeDeclineCode: null,
      stripeParam: "amount",
      requestId: "req_refund_123",
    },
  });
});

test("refund endpoint blocks remote Interac refunds", async () => {
  process.env.POS_API_KEY = "test-pos-key";
  const stripeMock = createStripeClient({
    paymentIntent: {
      latest_charge: {
        id: "ch_test_interac",
        status: "succeeded",
        amount: 1254,
        amount_refunded: 0,
        currency: "cad",
        payment_method_details: {
          type: "interac_present",
        },
      },
    },
  });
  setStripeClientForTesting(stripeMock.client as never);

  const res = createResponse();
  await refundHandler(
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-pos-key",
      },
      body: {
        paymentIntentId: "pi_123abc",
        currency: "cad",
        reason: "Customer request",
        idempotencyKey: "refund-attempt-006",
      },
    } as never,
    res.response as never,
  );
  setStripeClientForTesting(null);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonBody, {
    success: false,
    error: {
      code: "IN_PERSON_REFUND_REQUIRED",
      message: "This payment requires an in-person Terminal refund.",
    },
  });
  assert.equal(stripeMock.refundsCreateCalls.length, 0);
});

test("refund endpoint supports charge-based refunds when paymentIntentId is omitted", async () => {
  process.env.POS_API_KEY = "test-pos-key";
  const stripeMock = createStripeClient({
    refundResult: {
      payment_intent: null,
      amount: 100,
    },
  });
  setStripeClientForTesting(stripeMock.client as never);

  const res = createResponse();
  await refundHandler(
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-pos-key",
      },
      body: {
        chargeId: "ch_123abc",
        amount: 100,
        currency: "cad",
        reason: "Customer request",
        note: "optional text",
        idempotencyKey: "refund-attempt-charge-001",
      },
    } as never,
    res.response as never,
  );
  setStripeClientForTesting(null);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(stripeMock.refundsCreateCalls, [
    {
      params: {
        charge: "ch_123abc",
        amount: 100,
        metadata: {
          source: "PowersOfZeroPOS",
          reason: "Customer request",
          note: "optional text",
        },
      },
      options: {
        idempotencyKey: "refund-attempt-charge-001",
      },
    },
  ]);
});

test("refund endpoint rejects requests missing both paymentIntentId and chargeId", async () => {
  process.env.POS_API_KEY = "test-pos-key";

  const res = createResponse();
  await refundHandler(
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-pos-key",
      },
      body: {
        amount: 100,
        currency: "cad",
        reason: "Customer request",
      },
    } as never,
    res.response as never,
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.jsonBody, {
    success: false,
    error: {
      code: "BAD_REQUEST",
      message: "Either paymentIntentId or chargeId is required.",
    },
  });
});
