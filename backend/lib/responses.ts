import type { VercelResponse } from "@vercel/node";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "IN_PERSON_REFUND_REQUIRED"
  | "METHOD_NOT_ALLOWED"
  | "STRIPE_PAYMENT_INTENT_ERROR"
  | "STRIPE_REFUND_ERROR"
  | "STRIPE_UNAVAILABLE"
  | "SERVER_MISCONFIGURED"
  | "UNAUTHORIZED";

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiFailure = {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    stripeCode?: string | null;
    stripeDeclineCode?: string | null;
    stripeParam?: string | null;
    requestId?: string | null;
  };
};

export function sendSuccess<T>(
  res: VercelResponse,
  statusCode: number,
  data: T,
): VercelResponse {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

export function sendError(
  res: VercelResponse,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  details?: {
    stripeCode?: string | null;
    stripeDeclineCode?: string | null;
    stripeParam?: string | null;
    requestId?: string | null;
  },
): VercelResponse {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details ?? {}),
    },
  });
}
