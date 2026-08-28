export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** HMAC key for the anonymous identity cookie. Set via `wrangler secret put`. */
  SESSION_SECRET?: string;
  /**
   * Web Push signing key: a P-256 private JWK as JSON (`scripts/generate-vapid.mjs`
   * prints one). Set via `wrangler secret put VAPID_PRIVATE_JWK`; while unset,
   * every push endpoint reports the feature as unavailable and nothing sends.
   */
  VAPID_PRIVATE_JWK?: string;
  /** Contact URI (mailto: or https:) push services may use to reach the operator. */
  VAPID_SUBJECT?: string;
  /**
   * Bearer token for POST /api/push/announce (admin update broadcasts). Set
   * via `wrangler secret put ANNOUNCE_TOKEN` with a value the admin keeps —
   * while unset the endpoint answers 404 as if it didn't exist.
   */
  ANNOUNCE_TOKEN?: string;
  ENVIRONMENT?: string;
}
