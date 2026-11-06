import "dotenv/config";

const ENV = (process.env.PAYPAL_ENVIRONMENT || "sandbox").toLowerCase();
const BASE = (ENV === "production" || ENV === "live")
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

let cached = null;
export async function token() {
  if (cached && Date.now() < cached.exp - 60000) return cached.tok;
  const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal creds missing");
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  const d = await r.json();
  cached = { tok: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return cached.tok;
}
export async function pp(method, path, body) {
  const t = await token();
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`PayPal ${method} ${path} -> ${r.status}: ${txt}`);
  return txt ? JSON.parse(txt) : {};
}
export const base = BASE;
export async function verifyWebhook(headers, body) {
  const wid = process.env.PAYPAL_WEBHOOK_ID;
  if (!wid) return { verified: false, reason: "PAYPAL_WEBHOOK_ID not set" };
  try {
    const r = await pp("POST", "/v1/notifications/verify-webhook-signature", {
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: wid,
      webhook_event: body,
    });
    return { verified: r.verification_status === "SUCCESS", status: r.verification_status };
  } catch (e) {
    return { verified: false, reason: e.message };
  }
}
