import crypto from "crypto";

/**
 * Server-only helper: hashes a client cart lifecycle token the exact same way
 * the `sync_public_cart` / `restore_public_cart` / `complete_public_cart`
 * SECURITY DEFINER RPCs do — base64url token → SHA-256 → lowercase hex.
 *
 * Lives outside any "use server" module because "use server" files may only
 * export async server actions, and this needs to be callable synchronously
 * from several of them. Keep importers server-side only.
 */
export function hashCartToken(token: string): string | null {
  if (
    typeof token !== "string" ||
    token.length < 32 ||
    token.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(token)
  ) {
    return null;
  }
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}
