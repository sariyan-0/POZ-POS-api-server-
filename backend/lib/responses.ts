import type { VercelResponse } from "@vercel/node";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "METHOD_NOT_ALLOWED"
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
): VercelResponse {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
}
