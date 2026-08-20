import test from "node:test";
import assert from "node:assert/strict";

import createCustomerHandler from "../api/customers/create";
import searchCustomersHandler from "../api/customers/search";
import createPaymentIntentHandler from "../api/payments/create-intent";
import { setStripeClientForTesting } from "../lib/stripe";

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
  };
}

function createStripeClient() {
  const customerListCalls: Array<Record<string, unknown>> = [];
  const customerCreateCalls: Array<Record<string, unknown>> = [];
  const customerUpdateCalls: Array<{ id: string; params: Record<string, unknown> }> = [];
  const customerRetrieveCalls: string[] = [];
  const paymentIntentCreateCalls: Array<{
    params: Record<string, unknown>;
    options: Record<string, unknown>;
  }> = [];

  const customerCreateResult = {
    id: "cus_created_123",
    name: "Customer Name",
    email: "customer@example.com",
    phone: "+15550001111",
    metadata: {
      localCustomerId: "cust_local_123",
      note: "vip",
      updatedAt: "2026-08-20T12:00:00.000Z",
    },
    created: 1_723_000_000,
  };

  const existingCustomer = {
    id: "cus_existing_123",
    name: "Customer Name",
    email: "customer@example.com",
    phone: "+15550001111",
    metadata: {
      localCustomerId: "cust_local_123",
      note: "vip",
      updatedAt: "2026-08-19T12:00:00.000Z",
    },
    created: 1_723_000_000,
  };

  return {
    client: {
      customers: {
        list: async (params: Record<string, unknown>) => {
          customerListCalls.push(params);
          if (params.email === "customer@example.com") {
            return { data: [existingCustomer] };
          }

          return { data: [existingCustomer] };
        },
        create: async (params: Record<string, unknown>) => {
          customerCreateCalls.push(params);
          return customerCreateResult;
        },
        update: async (id: string, params: Record<string, unknown>) => {
          customerUpdateCalls.push({ id, params });
          return {
            ...existingCustomer,
            ...params,
            id,
            metadata: {
              ...existingCustomer.metadata,
              ...(params.metadata as Record<string, string>),
            },
          };
        },
        retrieve: async (id: string) => {
          customerRetrieveCalls.push(id);
          return {
            ...existingCustomer,
            id,
          };
        },
      },
      paymentIntents: {
        create: async (
          params: Record<string, unknown>,
          options: Record<string, unknown>,
        ) => {
          paymentIntentCreateCalls.push({ params, options });
          return {
            id: "pi_test_123",
            client_secret: "pi_test_123_secret_abc",
            status: "requires_payment_method",
            capture_method: "automatic",
            customer: params.customer ?? null,
          };
        },
      },
    },
    customerListCalls,
    customerCreateCalls,
    customerUpdateCalls,
    customerRetrieveCalls,
    paymentIntentCreateCalls,
  };
}

test("customer create endpoint rejects missing authentication", async () => {
  process.env.POS_API_KEY = "test-pos-key";
  setStripeClientForTesting(null);

  const res = createResponse();
  await createCustomerHandler(
    {
      method: "POST",
      headers: {},
      body: {},
    } as never,
    res.response as never,
  );

  assert.equal(res.statusCode, 401);
});

test("customer create endpoint reuses an existing Stripe customer", async () => {
  process.env.POS_API_KEY = "test-pos-key";
  const stripeMock = createStripeClient();
  setStripeClientForTesting(stripeMock.client as never);

  const res = createResponse();
  await createCustomerHandler(
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-pos-key",
      },
      body: {
        localCustomerId: "cust_local_123",
        name: "Customer Name",
        email: "customer@example.com",
        phone: "+15550001111",
        note: "vip",
      },
    } as never,
    res.response as never,
  );
  setStripeClientForTesting(null);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(stripeMock.customerUpdateCalls.length, 1);
  assert.equal(stripeMock.customerCreateCalls.length, 0);
  assert.equal(
    (res.jsonBody as { success: boolean }).success,
    true,
  );
  assert.deepEqual(
    (res.jsonBody as { data: { customer: unknown } }).data.customer,
    {
      id: "cust_local_123",
      localCustomerId: "cust_local_123",
      stripeCustomerId: "cus_existing_123",
      name: "Customer Name",
      email: "customer@example.com",
      phone: "+15550001111",
      note: "vip",
      createdAt: "2024-08-07T03:06:40.000Z",
      updatedAt: stripeMock.customerUpdateCalls[0]?.params.metadata.updatedAt,
    },
  );
});

test("customer search endpoint returns safe customer objects", async () => {
  process.env.POS_API_KEY = "test-pos-key";
  const stripeMock = createStripeClient();
  setStripeClientForTesting(stripeMock.client as never);

  const res = createResponse();
  await searchCustomersHandler(
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-pos-key",
      },
      body: {
        query: "customer@example.com",
      },
    } as never,
    res.response as never,
  );
  setStripeClientForTesting(null);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.jsonBody, {
    success: true,
    data: {
      customers: [
        {
          id: "cust_local_123",
          localCustomerId: "cust_local_123",
          stripeCustomerId: "cus_existing_123",
          name: "Customer Name",
          email: "customer@example.com",
          phone: "+15550001111",
          note: "vip",
          createdAt: "2024-08-07T03:06:40.000Z",
          updatedAt: "2026-08-19T12:00:00.000Z",
        },
      ],
    },
  });
});

test("payment intent endpoint attaches an existing Stripe customer", async () => {
  process.env.POS_API_KEY = "test-pos-key";
  const stripeMock = createStripeClient();
  setStripeClientForTesting(stripeMock.client as never);

  const res = createResponse();
  await createPaymentIntentHandler(
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-pos-key",
      },
      body: {
        amount: 100,
        currency: "cad",
        idempotencyKey: "sale-attempt-existing-customer",
        customer: {
          localCustomerId: "cust_local_123",
          stripeCustomerId: "cus_existing_123",
          name: "Customer Name",
          email: "customer@example.com",
          phone: "+15550001111",
        },
      },
    } as never,
    res.response as never,
  );
  setStripeClientForTesting(null);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(stripeMock.customerRetrieveCalls, ["cus_existing_123"]);
  assert.deepEqual(stripeMock.paymentIntentCreateCalls, [
    {
      params: {
        amount: 100,
        currency: "cad",
        payment_method_types: ["card_present", "interac_present"],
        customer: "cus_existing_123",
        metadata: {
          localCustomerId: "cust_local_123",
          customerName: "Customer Name",
        },
      },
      options: {
        idempotencyKey: "sale-attempt-existing-customer",
      },
    },
  ]);
  assert.deepEqual(res.jsonBody, {
    success: true,
    data: {
      paymentIntentId: "pi_test_123",
      clientSecret: "pi_test_123_secret_abc",
      status: "requires_payment_method",
      captureMethod: "automatic",
      stripeCustomerId: "cus_existing_123",
    },
  });
});

test("payment intent endpoint creates a Stripe customer when frontend has no stripeCustomerId", async () => {
  process.env.POS_API_KEY = "test-pos-key";
  const stripeMock = createStripeClient();
  setStripeClientForTesting(stripeMock.client as never);

  const res = createResponse();
  await createPaymentIntentHandler(
    {
      method: "POST",
      headers: {
        authorization: "Bearer test-pos-key",
      },
      body: {
        amount: 100,
        currency: "cad",
        idempotencyKey: "sale-attempt-new-customer",
        customer: {
          localCustomerId: "cust_local_123",
          name: "Customer Name",
          email: "customer@example.com",
          phone: "+15550001111",
        },
      },
    } as never,
    res.response as never,
  );
  setStripeClientForTesting(null);

  assert.equal(res.statusCode, 200);
  assert.equal(stripeMock.customerUpdateCalls.length, 1);
  assert.deepEqual(res.jsonBody, {
    success: true,
    data: {
      paymentIntentId: "pi_test_123",
      clientSecret: "pi_test_123_secret_abc",
      status: "requires_payment_method",
      captureMethod: "automatic",
      stripeCustomerId: "cus_existing_123",
    },
  });
});
