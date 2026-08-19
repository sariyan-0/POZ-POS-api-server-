import Stripe from "stripe";

export type StripeErrorDiagnostics = {
  type: string | null;
  code: string | null;
  declineCode: string | null;
  statusCode: number | null;
  param: string | null;
  message: string | null;
  requestId: string | null;
};

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export function getStripeErrorDiagnostics(
  error: unknown,
): StripeErrorDiagnostics | null {
  if (!(error instanceof Stripe.errors.StripeError)) {
    return null;
  }

  const requestId =
    asNullableString((error as { requestId?: unknown }).requestId) ??
    asNullableString((error as { request_id?: unknown }).request_id) ??
    asNullableString((error as { raw?: { requestId?: unknown } }).raw?.requestId) ??
    asNullableString((error as { raw?: { request_id?: unknown } }).raw?.request_id);

  return {
    type: asNullableString(error.type),
    code: asNullableString(error.code),
    declineCode: asNullableString(error.decline_code),
    statusCode: asNullableNumber(error.statusCode),
    param: asNullableString(error.param),
    message: asNullableString(error.message),
    requestId,
  };
}

export function logStripeError(
  context: string,
  error: unknown,
  extra: Record<string, unknown> = {},
): void {
  const diagnostics = getStripeErrorDiagnostics(error);

  if (diagnostics) {
    console.error(
      JSON.stringify({
        context,
        ...extra,
        stripe: diagnostics,
      }),
    );
    return;
  }

  if (error instanceof Error) {
    console.error(
      JSON.stringify({
        context,
        ...extra,
        error: {
          name: error.name,
          message: error.message,
        },
      }),
    );
    return;
  }

  console.error(
    JSON.stringify({
      context,
      ...extra,
      error: {
        message: "Unknown non-Error throwable.",
      },
    }),
  );
}
