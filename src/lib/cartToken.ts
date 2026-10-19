/**
 * Browser-side cart lifecycle token, used to correlate one storefront browser
 * cart with its server-side abandoned-cart record.
 *
 * Security properties (matching the server-side sync contract):
 * - 32 cryptographically random bytes, base64url encoded (~43 chars): the
 *   raw token is unguessable and acts as the ONLY authentication for reading
 *   or converting a server cart record server-side later.
 * - The token is persisted in localStorage per store slug; ONLY its SHA-256
 *   hash is ever sent to/kept on the server (cartTokenHash.ts runs server-side).
 * - It never contains order/customer data and is never placed in checkout
 *   payloads beyond the anonymous sync call.
 */

const TOKEN_STORAGE_KEY = (slug: string) => `klyvo_cart_token_${slug}`;

const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let token = "";
  for (let i = 0; i < bytes.length; i++) {
    // Modulo over an alphabet of 64 → exactly 6 bits per character, so the
    // distribution stays uniform without rejection.
    token += TOKEN_ALPHABET[bytes[i] & 63];
  }
  return token;
}

export function isValidCartTokenShape(token: unknown): token is string {
  return (
    typeof token === "string" &&
    token.length >= 32 &&
    token.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(token)
  );
}

/**
 * Returns the browser's stable lifecycle token for this store's cart,
 * creating and persisting one on first use. Returns null only when
 * localStorage/WebCrypto are unavailable (best-effort feature).
 */
export function getOrCreateCartToken(slug: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(TOKEN_STORAGE_KEY(slug));
    if (isValidCartTokenShape(existing)) return existing;

    const fresh = randomToken();
    window.localStorage.setItem(TOKEN_STORAGE_KEY(slug), fresh);
    return fresh;
  } catch {
    return null;
  }
}
