import Stripe from "stripe";
import { sendError } from "./responses";

export type NormalizedTerminalLocation = {
  id: string;
  displayName: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  };
};

export type CreateTerminalLocationInput = {
  displayName: string;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    state: string | null;
    postalCode: string;
    country: string;
  };
};

type ValidationResult =
  | { ok: true; value: CreateTerminalLocationInput }
  | { ok: false; message: string };

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalTrimmedString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return asTrimmedString(value);
}

export function normalizeTerminalLocation(
  location: Stripe.Terminal.Location,
): NormalizedTerminalLocation {
  return {
    id: location.id,
    displayName: location.display_name ?? null,
    address: {
      line1: location.address?.line1 ?? null,
      line2: location.address?.line2 ?? null,
      city: location.address?.city ?? null,
      state: location.address?.state ?? null,
      postalCode: location.address?.postal_code ?? null,
      country: location.address?.country ?? null,
    },
  };
}

export function validateCreateTerminalLocationInput(
  body: unknown,
): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const payload = body as Record<string, unknown>;
  const displayName = asTrimmedString(payload.displayName);
  if (!displayName) {
    return { ok: false, message: "displayName is required." };
  }

  if (
    !payload.address ||
    typeof payload.address !== "object" ||
    Array.isArray(payload.address)
  ) {
    return { ok: false, message: "address is required." };
  }

  const address = payload.address as Record<string, unknown>;
  const line1 = asTrimmedString(address.line1);
  const city = asTrimmedString(address.city);
  const postalCode = asTrimmedString(address.postalCode);
  const country = asTrimmedString(address.country)?.toUpperCase() ?? null;
  const line2 = asOptionalTrimmedString(address.line2);
  const state = asOptionalTrimmedString(address.state);

  if (!line1) {
    return { ok: false, message: "address.line1 is required." };
  }

  if (!city) {
    return { ok: false, message: "address.city is required." };
  }

  if (!postalCode) {
    return { ok: false, message: "address.postalCode is required." };
  }

  if (!country || country.length !== 2) {
    return { ok: false, message: "address.country must be a 2-letter country code." };
  }

  if (country === "JP") {
    return {
      ok: false,
      message:
        "Japan Terminal Locations require Japan-specific Stripe fields and are not supported by this endpoint.",
    };
  }

  return {
    ok: true,
    value: {
      displayName,
      address: {
        line1,
        line2,
        city,
        state,
        postalCode,
        country,
      },
    },
  };
}

export function buildCreateTerminalLocationParams(
  input: CreateTerminalLocationInput,
): Stripe.Terminal.LocationCreateParams {
  return {
    display_name: input.displayName,
    address: {
      line1: input.address.line1,
      line2: input.address.line2 ?? undefined,
      city: input.address.city,
      state: input.address.state ?? undefined,
      postal_code: input.address.postalCode,
      country: input.address.country,
    },
  };
}
