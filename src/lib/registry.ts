// GUARDRAIL's own seller registry: the facts the policy engine trusts, maintained by the club,
// not by the shops. A seller is identified by the PayPal account that actually gets paid.

export type RegisteredSeller = {
  shopId: string;
  legalName: string;
  country: string;
  eu: boolean;
  /** Verified rating from an independent source, not the shop's own claim. */
  verifiedRating: number;
  payeeEmail: string | undefined;
};

const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

const seller = (shopId: string, legalName: string, country: string, verifiedRating: number, payeeEnv: string) => ({
  shopId,
  legalName,
  country,
  eu: EU_COUNTRIES.has(country),
  verifiedRating,
  payeeEmail: process.env[payeeEnv] || undefined,
});

/** DealZone X is deliberately absent: it was never verified. */
export const sellerRegistry = (): RegisteredSeller[] => [
  seller("nordic-gear", "Nordic Gear B.V.", "NL", 4.7, "PAYEE_EMAIL_NORDIC_GEAR"),
  seller("eu-sportdirect", "EU SportDirect GmbH", "DE", 4.4, "PAYEE_EMAIL_EU_SPORTDIRECT"),
];

/** Who is this payee really? Looks up the PayPal account from the order, never the agent's claim. */
export const sellerByPayee = (payeeEmail: string | undefined) =>
  payeeEmail ? sellerRegistry().find((s) => s.payeeEmail?.toLowerCase() === payeeEmail.toLowerCase()) : undefined;
