import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendError } from "./responses";

export function applySecurityHeaders(res: VercelResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
}

export function requireMethod(
  req: VercelRequest,
  res: VercelResponse,
  allowedMethod: string,
): boolean {
  if (req.method === allowedMethod) {
    return true;
  }

  res.setHeader("Allow", allowedMethod);
  sendError(
    res,
    405,
    "METHOD_NOT_ALLOWED",
    `Method ${req.method ?? "UNKNOWN"} not allowed.`,
  );
  return false;
}

