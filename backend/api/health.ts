import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticatePosApiKey } from "../lib/auth";
import { applySecurityHeaders, requireMethod } from "../lib/http";
import { sendSuccess } from "../lib/responses";

type HealthResponseData = {
  status: "ok";
  service: "PowersOfZeroPOS";
  apiVersion: 1;
};

export default function handler(
  req: VercelRequest,
  res: VercelResponse,
): VercelResponse | void {
  applySecurityHeaders(res);

  if (!requireMethod(req, res, "GET")) {
    return;
  }

  if (!authenticatePosApiKey(req, res)) {
    return;
  }

  const data: HealthResponseData = {
    status: "ok",
    service: "PowersOfZeroPOS",
    apiVersion: 1,
  };

  return sendSuccess(res, 200, data);
}

