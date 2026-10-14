// Cryptographic primitives only. Not wired to production routes until DB-backed
// atomic consumption, rate limits and verified email delivery are implemented.
export const OTP_TTL_SECONDS = 600;
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_SECONDS = 86400;
export const SESSION_COOKIE = "__Host-mandate-session";

export function normalizeLoginEmail(input: unknown): string {
  if (typeof input !== "string") throw new Error("Invalid email");
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email");
  return email;
}

export function generateOtp(): string {
  // Rejection sampling avoids modulo bias. No Math.random or static fallback.
  const values = new Uint32Array(1);
  const ceiling = Math.floor(2 ** 32 / 1000000) * 1000000;
  do { crypto.getRandomValues(values); } while (values[0] >= ceiling);
  return String(values[0] % 1000000).padStart(6, "0");
}

export function generateSessionToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
}

export async function otpDigest(secret: string, challengeId: string, email: string, code: string): Promise<string> {
  if (secret.length < 32 || !/^\d{6}$/.test(code)) throw new Error("Invalid OTP configuration");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const data = encoder.encode(JSON.stringify(["mandate-email-otp-v1", challengeId, normalizeLoginEmail(email), code]));
  return hex(await crypto.subtle.sign("HMAC", key, data));
}

export async function sessionDigest(token: string): Promise<string> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid session token");
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
}

export function sessionCookie(token: string): string {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid session token");
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

function hex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), b => b.toString(16).padStart(2, "0")).join("");
}
