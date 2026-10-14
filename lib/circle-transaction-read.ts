import "server-only";
import { env } from "cloudflare:workers";
import { fail } from "./arc-safety";
import { paymentNetwork } from "./payment-network";

// Diagnostic GET only. Fixed Circle origin, no signing or write endpoint.
export async function readCircleTransactions(walletId = env.CIRCLE_PRIMARY_WALLET_ID, chainId = 5042002) {
  const key=paymentNetwork(chainId).name === 'mainnet' ? env.CIRCLE_MAINNET_API_KEY : env.CIRCLE_API_KEY;
  if (!key || !walletId) fail("Circle read configuration unavailable", 503);
  const url = new URL("https://api.circle.com/v1/w3s/transactions");
  url.searchParams.set("walletIds", walletId);
  url.searchParams.set("custodyType", "DEVELOPER");
  url.searchParams.set("pageSize", "50");
  url.searchParams.set("order", "DESC");
  try {
    const response = await fetch(url, { method: "GET", headers: { authorization: `Bearer ${key}`, accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    const body = await response.json() as { code?: unknown; data?: { transactions?: Array<{ id: string; refId?: string; blockchain?: string; state?: string; txHash?: string; contractAddress?: string }> } };
    if (!response.ok) return { ok: false as const, phase: "circle_list", httpStatus: response.status, providerCode: typeof body.code === "number" ? body.code : null };
    if (!Array.isArray(body.data?.transactions)) return { ok: false as const, phase: "circle_response_shape", httpStatus: response.status, providerCode: null };
    return { ok: true as const, transactions: body.data.transactions };
  } catch { return { ok: false as const, phase: "circle_transport_or_json", httpStatus: null, providerCode: null }; }
}
