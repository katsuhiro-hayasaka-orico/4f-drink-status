export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** HMAC key for the anonymous identity cookie. Set via `wrangler secret put`. */
  SESSION_SECRET?: string;
  ENVIRONMENT?: string;
}
