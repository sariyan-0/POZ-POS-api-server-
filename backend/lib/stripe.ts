import Stripe from "stripe";

let stripeClient: Stripe | null = null;

function getStripeSecretKey(): string | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  return typeof secretKey === "string" && secretKey.length > 0
    ? secretKey
    : null;
}

export function getStripeClient(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  const secretKey = getStripeSecretKey();
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

export function setStripeClientForTesting(client: Stripe | null): void {
  stripeClient = client;
}

export async function verifyStripeConnection(): Promise<{
  connected: true;
  livemode: boolean;
}> {
  const stripe = getStripeClient();
  const balance = await stripe.balance.retrieve();

  return {
    connected: true,
    livemode: balance.livemode,
  };
}

export async function createTerminalConnectionToken(): Promise<{
  secret: string;
}> {
  const stripe = getStripeClient();
  const connectionToken = await stripe.terminal.connectionTokens.create();

  return {
    secret: connectionToken.secret,
  };
}
