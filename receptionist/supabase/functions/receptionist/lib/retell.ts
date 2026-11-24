// Verifies that a request really came from Retell.
// Header format (docs.retellai.com/features/secure-webhook): "v={timestamp_ms},d={hex}"
// where hex = HMAC-SHA256(raw_body + timestamp, api_key).

const FIVE_MINUTES = 5 * 60 * 1000;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacHex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyRetellSignature(
  rawBody: string,
  apiKey: string,
  signature: string | null,
  now: number = Date.now(),
): Promise<boolean> {
  if (!signature || !apiKey) return false;
  const m = /^v=(\d+),d=([0-9a-f]+)$/i.exec(signature.trim());
  if (!m) return false;
  const ts = Number(m[1]);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > FIVE_MINUTES) return false;
  const expected = await hmacHex(apiKey, rawBody + m[1]);
  return timingSafeEqual(expected, m[2].toLowerCase());
}
