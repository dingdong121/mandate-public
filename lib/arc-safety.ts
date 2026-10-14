import { Interface } from "ethers";
import { ARC } from "./arc";

export const TESTNET = 5042002;
export const USDC = "0x3600000000000000000000000000000000000000";
export const escrowEvents = new Interface([
  "event JobCreated(uint256 indexed jobId,address indexed client,address indexed provider,address evaluator,uint256 expiresAt,string description)",
  "event BudgetSet(uint256 indexed jobId,uint256 amount)",
  "event Funded(uint256 indexed jobId,uint256 amount)",
  "event Submitted(uint256 indexed jobId,bytes32 deliverableHash)",
  "event Completed(uint256 indexed jobId,bytes32 reasonHash)",
  "event Rejected(uint256 indexed jobId,bytes32 reasonHash)",
  "event Refunded(uint256 indexed jobId,uint256 amount)",
  "event Approval(address indexed owner,address indexed spender,uint256 value)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
export function fail(message: string, status = 409): never { throw new Response(JSON.stringify({ error: message }), { status, headers: { "content-type": "application/json" } }); }
export function assertTestnet(chainId: number) { if (chainId !== TESTNET) fail("Mainnet writes are disabled; network approval is required", 423); }
export function assertPaymentNetwork(chainId: number) { if (chainId !== TESTNET && chainId !== ARC.mainnet.chainId) fail("Unsupported payment network", 423); }
export function validExpiry(deadline: string) {
  const seconds = Math.floor(new Date(deadline).getTime() / 1000);
  if (!Number.isSafeInteger(seconds) || seconds <= Math.floor(Date.now() / 1000) || BigInt(seconds) > (1n << 64n) - 1n) fail("Deadline is outside the supported future range", 400);
  return seconds;
}
export function mutationOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") fail("Same-origin authenticated action required", 403);
}
export function requestKey(request: Request) {
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[a-f0-9-]{36}$/i.test(key)) fail("A UUID idempotency key is required", 400);
  return key;
}
export async function rpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  // This helper is strictly read-only. Raw/signed broadcasts must never use it.
  if (!["eth_chainId", "eth_getCode", "eth_getTransactionReceipt", "eth_call", "eth_getBalance", "eth_getTransactionByHash", "eth_getBlockByNumber", "eth_getBlockByHash", "eth_getLogs", "eth_estimateGas", "eth_gasPrice"].includes(method)) {
    fail("Only read-only RPC methods are supported", 405);
  }
  let diagnostic = "transport";
  // Bounded retry of ALLOWLISTED READS only. No SDK send or broadcast is retried.
  for (let attempt = 0; attempt < 2; attempt++) {
    // Do not immediately hammer the same shared endpoint after throttling.
    // Read-only retry only; transaction submission is never retried here.
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 2000));
    let response: Response;
    try {
      response = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(10000) });
    } catch { diagnostic = "transport/timeout"; continue; }
    let body: { result?: T; error?: { code?: number } };
    try { body = await response.json() as typeof body; }
    catch { diagnostic = `HTTP ${response.status}, invalid JSON`; if (response.status === 429 || response.status >= 500) continue; break; }
    if (response.ok && !body.error && body.result !== undefined) return body.result;
    const code = typeof body.error?.code === "number" ? body.error.code : undefined;
    diagnostic = `HTTP ${response.status}${code !== undefined ? `, RPC code ${code}` : ", missing result"}`;
    if (response.status === 429 || response.status >= 500 || code === -32005) continue;
    break; // semantic RPC errors require diagnosis, not retries
  }
  // Never expose endpoint credentials, payload, raw provider text or stack.
  fail(`Arc read-only verification failed at ${method} (${diagnostic})`, 503);
}
export async function verifyRpc(rpcUrl: string, chainId: number) {
  if (Number(BigInt(await rpc<string>(rpcUrl, "eth_chainId", []))) !== chainId) fail("RPC chain does not match the record", 503);
}
export function testnetRpc(override?: string) { return override || ARC.testnet.rpcUrl; }
export type Receipt = { status: string; transactionHash: string; to: string; from: string; logs: Array<{ address: string; topics: string[]; data: string }> };
export function validateReceipt(receipt: Receipt | null, hash: string, target: string, sender: string) {
  if (!receipt || receipt.status !== "0x1" || receipt.transactionHash.toLowerCase() !== hash.toLowerCase() || receipt.to?.toLowerCase() !== target.toLowerCase() || receipt.from?.toLowerCase() !== sender.toLowerCase()) fail("Transaction receipt does not match the expected successful execution");
  return receipt;
}
export function receiptEvent(receipt: Receipt, address: string, name: string) {
  const events = receipt.logs.filter(log => log.address.toLowerCase() === address.toLowerCase()).flatMap(log => {
    try { const parsed = escrowEvents.parseLog(log); return parsed?.name === name ? [parsed] : []; } catch { return []; }
  });
  if (events.length !== 1) fail("Expected exactly one escrow event from the configured contract");
  return events[0];
}
// Arc native-USDC and ERC-20 logs can describe the same movement. Validate
// exactly the configured ERC-20 representation; never sum both representations.
export function validateUsdcTransfer(receipt: Receipt, from: string, to: string, amount: bigint) {
  const event = receiptEvent(receipt, USDC, "Transfer");
  if (event.args.from.toLowerCase() !== from.toLowerCase() || event.args.to.toLowerCase() !== to.toLowerCase() || event.args.value !== amount) {
    fail("USDC transfer does not match the expected sender, recipient and amount");
  }
}
export function jobIdFromReceipt(receipt: Receipt, contract: string, client: string, provider: string, evaluator: string, expiry: number, description: string) {
  const { args } = receiptEvent(receipt, contract, "JobCreated");
  if (args.client.toLowerCase() !== client.toLowerCase() || args.provider.toLowerCase() !== provider.toLowerCase() || args.evaluator.toLowerCase() !== evaluator.toLowerCase() || args.expiresAt !== BigInt(expiry) || args.description !== description || args.jobId <= 0n) fail("JobCreated parties or payload do not match the bounty");
  return String(args.jobId);
}
