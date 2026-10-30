// Thin client for the PayPal REST API (Orders v2 + Payments v2), sandbox by default.
// Server-side only: never import this from a client component.

const BASE_URL = process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com";

export type Money = { currency_code: string; value: string };

export type Authorization = { id: string; status: string; amount: Money };

/** The parts of an Orders v2 order GUARDRAIL reads. */
export type PayPalOrder = {
  id: string;
  status: string;
  links?: { rel: string; href: string }[];
  purchase_units: {
    amount: Money;
    payee?: { email_address?: string; merchant_id?: string };
    payments?: { authorizations?: Authorization[] };
  }[];
  payment_source?: { paypal?: { attributes?: { vault?: { id?: string; status?: string } } } };
};

export type Capture = { id: string; status: string; status_details?: { reason: string } };

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: unknown,
  ) {
    super(message);
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing");

  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await res.json();
  if (!res.ok) throw new PayPalError("Failed to get access token", res.status, body);

  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}

export async function call<T = unknown>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  requestId?: string,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      // Idempotency: retrying with the same id never creates a second order/capture.
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new PayPalError(`${method} ${path} failed`, res.status, json);
  return json as T;
}

export type CreateOrderInput = {
  amount: Money;
  description: string;
  referenceId: string;
  /** Who gets paid. Checked against the seller registry by the policy engine (rule R5). */
  payeeEmail?: string;
  /** Pay with a saved PayPal wallet: no buyer approval needed (the "mandate"). */
  vaultId?: string;
  /** Ask the buyer to save their wallet for later agent purchases. */
  storeInVault?: boolean;
  returnUrl: string;
  cancelUrl: string;
  requestId?: string;
};

export function createOrder(input: CreateOrderInput) {
  const paypal: Record<string, unknown> = input.vaultId
    ? { vault_id: input.vaultId }
    : {
        experience_context: {
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
          user_action: "CONTINUE",
          shipping_preference: "NO_SHIPPING",
          brand_name: "GUARDRAIL",
        },
        ...(input.storeInVault
          ? {
              attributes: {
                vault: {
                  store_in_vault: "ON_SUCCESS",
                  usage_type: "MERCHANT",
                  customer_type: "CONSUMER",
                },
              },
            }
          : {}),
      };

  return call<PayPalOrder>("POST", "/v2/checkout/orders", {
    intent: "AUTHORIZE",
    purchase_units: [
      {
        reference_id: input.referenceId,
        description: input.description,
        amount: input.amount,
        ...(input.payeeEmail ? { payee: { email_address: input.payeeEmail } } : {}),
      },
    ],
    payment_source: { paypal },
  }, input.requestId);
}

export const getOrder = (orderId: string) => call<PayPalOrder>("GET", `/v2/checkout/orders/${orderId}`);

export const authorizeOrder = (orderId: string, requestId?: string) =>
  call<PayPalOrder>("POST", `/v2/checkout/orders/${orderId}/authorize`, {}, requestId);

export const captureAuthorization = (authorizationId: string, requestId?: string) =>
  call<Capture>("POST", `/v2/payments/authorizations/${authorizationId}/capture`, { final_capture: true }, requestId);

export const voidAuthorization = (authorizationId: string, requestId?: string) =>
  call("POST", `/v2/payments/authorizations/${authorizationId}/void`, undefined, requestId);

/** First authorization on an order, if any. */
export const authorizationOf = (order: PayPalOrder): Authorization | undefined =>
  order.purchase_units[0]?.payments?.authorizations?.[0];

/** Vault id of the buyer's saved wallet, once PayPal has vaulted it. */
export const vaultIdOf = (order: PayPalOrder): string | undefined =>
  order.payment_source?.paypal?.attributes?.vault?.id;

export const approveUrlOf = (order: PayPalOrder): string | undefined =>
  order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;

/** Verifies a webhook really came from PayPal (used from day 3). */
export async function verifyWebhookSignature(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID missing");
  // No PayPal signature headers at all: not from PayPal, no need to ask.
  if (!headers.get("paypal-transmission-sig")) return false;
  const result = await call<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: JSON.parse(rawBody),
  });
  return result.verification_status === "SUCCESS";
}
