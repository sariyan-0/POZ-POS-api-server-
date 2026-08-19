import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendError } from "./responses";

const UNAUTHORIZED_MESSAGE = "Invalid or missing POS API key.";

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function authenticatePosApiKey(
  req: VercelRequest,
  res: VercelResponse,
): boolean {
  const expectedApiKey = process.env.POS_API_KEY;

  if (!expectedApiKey) {
    sendError(
      res,
      500,
      "SERVER_MISCONFIGURED",
      "POS API key is not configured on the server.",
    );
    return false;
  }

  const authorizationHeader = req.headers.authorization;
  if (!authorizationHeader) {
    sendError(res, 401, "UNAUTHORIZED", UNAUTHORIZED_MESSAGE);
    return false;
  }

  const [scheme, suppliedApiKey, ...rest] = authorizationHeader.split(" ");
  const isBearer =
    scheme?.toLowerCase() === "bearer" &&
    typeof suppliedApiKey === "string" &&
    suppliedApiKey.length > 0 &&
    rest.length === 0;

  if (!isBearer || !safeCompare(suppliedApiKey, expectedApiKey)) {
    sendError(res, 401, "UNAUTHORIZED", UNAUTHORIZED_MESSAGE);
    return false;
  }

  return true;
}

