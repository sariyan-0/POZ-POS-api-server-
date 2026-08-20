import Stripe from "stripe";

export type CreateCustomerInput = {
  localCustomerId?: string;
  name: string;
  email?: string;
  phone?: string;
  note?: string;
};

export type SearchCustomersInput = {
  query: string;
};

export type CustomerReferenceInput = {
  localCustomerId?: string;
  stripeCustomerId?: string;
  name?: string;
  email?: string;
  phone?: string;
};

export type NormalizedCustomer = {
  id: string;
  localCustomerId: string | null;
  stripeCustomerId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEmail(email?: string): string | undefined {
  return email ? email.toLowerCase() : undefined;
}

function buildCustomerMetadata(input: CreateCustomerInput): Record<string, string> {
  return {
    ...(input.localCustomerId ? { localCustomerId: input.localCustomerId } : {}),
    ...(input.note ? { note: input.note } : {}),
  };
}

function normalizeTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

export function validateCreateCustomerInput(body: unknown): ValidationResult<CreateCustomerInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const payload = body as Record<string, unknown>;
  const name = asTrimmedString(payload.name);
  if (!name) {
    return { ok: false, message: "name is required." };
  }

  return {
    ok: true,
    value: {
      localCustomerId: asTrimmedString(payload.localCustomerId) ?? undefined,
      name,
      email: normalizeEmail(asTrimmedString(payload.email) ?? undefined),
      phone: asTrimmedString(payload.phone) ?? undefined,
      note: asTrimmedString(payload.note) ?? undefined,
    },
  };
}

export function validateSearchCustomersInput(body: unknown): ValidationResult<SearchCustomersInput> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const payload = body as Record<string, unknown>;
  const query = asTrimmedString(payload.query);
  if (!query) {
    return { ok: false, message: "query is required." };
  }

  return {
    ok: true,
    value: {
      query,
    },
  };
}

export function validateCustomerReferenceInput(
  value: unknown,
): ValidationResult<CustomerReferenceInput | undefined> {
  if (typeof value === "undefined" || value === null) {
    return { ok: true, value: undefined };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "customer must be a JSON object." };
  }

  const payload = value as Record<string, unknown>;

  return {
    ok: true,
    value: {
      localCustomerId: asTrimmedString(payload.localCustomerId) ?? undefined,
      stripeCustomerId: asTrimmedString(payload.stripeCustomerId) ?? undefined,
      name: asTrimmedString(payload.name) ?? undefined,
      email: normalizeEmail(asTrimmedString(payload.email) ?? undefined),
      phone: asTrimmedString(payload.phone) ?? undefined,
    },
  };
}

export function normalizeCustomer(customer: Stripe.Customer): NormalizedCustomer {
  const localCustomerId = customer.metadata?.localCustomerId || null;
  const note = customer.metadata?.note || null;
  const updatedAt = customer.metadata?.updatedAt || normalizeTimestamp(customer.created);

  return {
    id: localCustomerId ?? customer.id,
    localCustomerId,
    stripeCustomerId: customer.id,
    name: customer.name ?? null,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    note,
    createdAt: normalizeTimestamp(customer.created),
    updatedAt,
  };
}

async function listCustomersByEmail(
  stripe: Stripe,
  email: string,
): Promise<Stripe.Customer[]> {
  const response = await stripe.customers.list({
    email,
    limit: 10,
  });

  return response.data.filter((customer) => !customer.deleted);
}

async function listCustomersByPhoneOrName(
  stripe: Stripe,
  query: string,
): Promise<Stripe.Customer[]> {
  const response = await stripe.customers.list({ limit: 100 });

  const normalizedQuery = query.toLowerCase();
  return response.data.filter((customer) => {
    if (customer.deleted) {
      return false;
    }

    return [customer.name, customer.email, customer.phone, customer.id, customer.metadata?.localCustomerId]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLowerCase().includes(normalizedQuery));
  });
}

async function retrieveStripeCustomer(
  stripe: Stripe,
  stripeCustomerId: string,
): Promise<Stripe.Customer | null> {
  const customer = await stripe.customers.retrieve(stripeCustomerId);
  if (customer.deleted) {
    return null;
  }

  return customer;
}

async function findReusableCustomer(
  stripe: Stripe,
  input: CreateCustomerInput,
): Promise<Stripe.Customer | null> {
  if (input.email) {
    const emailMatches = await listCustomersByEmail(stripe, input.email);
    const exactEmailMatch = emailMatches.find((customer) => {
      const sameName =
        !customer.name || customer.name.trim().toLowerCase() === input.name.toLowerCase();
      const samePhone =
        !input.phone || !customer.phone || customer.phone.trim() === input.phone;
      return sameName && samePhone;
    });

    if (exactEmailMatch) {
      return exactEmailMatch;
    }
  }

  if (input.phone) {
    const candidates = await listCustomersByPhoneOrName(stripe, input.phone);
    const phoneMatch = candidates.find((customer) => customer.phone === input.phone);
    if (phoneMatch) {
      return phoneMatch;
    }
  }

  return null;
}

export async function createOrReuseStripeCustomer(
  stripe: Stripe,
  input: CreateCustomerInput,
): Promise<Stripe.Customer> {
  const reusableCustomer = await findReusableCustomer(stripe, input);
  const metadata = {
    ...buildCustomerMetadata(input),
    updatedAt: new Date().toISOString(),
  };

  if (reusableCustomer) {
    const updatedCustomer = await stripe.customers.update(reusableCustomer.id, {
      name: input.name,
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      metadata: {
        ...reusableCustomer.metadata,
        ...metadata,
      },
    });

    return updatedCustomer.deleted ? reusableCustomer : updatedCustomer;
  }

  return stripe.customers.create({
    name: input.name,
    ...(input.email ? { email: input.email } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    metadata: metadata,
  });
}

export async function resolveOrCreateStripeCustomer(
  stripe: Stripe,
  input?: CustomerReferenceInput,
): Promise<Stripe.Customer | null> {
  if (!input) {
    return null;
  }

  if (input.stripeCustomerId) {
    const customer = await retrieveStripeCustomer(stripe, input.stripeCustomerId);
    if (customer) {
      return customer;
    }
  }

  if (!input.name && !input.email && !input.phone) {
    return null;
  }

  return createOrReuseStripeCustomer(stripe, {
    localCustomerId: input.localCustomerId,
    name: input.name ?? "Customer",
    email: input.email,
    phone: input.phone,
  });
}

export async function searchStripeCustomers(
  stripe: Stripe,
  input: SearchCustomersInput,
): Promise<NormalizedCustomer[]> {
  const query = input.query.trim();
  const seen = new Map<string, Stripe.Customer>();

  if (query.startsWith("cus_")) {
    const customer = await retrieveStripeCustomer(stripe, query);
    if (customer) {
      seen.set(customer.id, customer);
    }
  }

  if (query.includes("@")) {
    const emailMatches = await listCustomersByEmail(stripe, query.toLowerCase());
    for (const customer of emailMatches) {
      seen.set(customer.id, customer);
    }
  }

  const broaderMatches = await listCustomersByPhoneOrName(stripe, query);
  for (const customer of broaderMatches) {
    seen.set(customer.id, customer);
  }

  return Array.from(seen.values()).map(normalizeCustomer);
}
