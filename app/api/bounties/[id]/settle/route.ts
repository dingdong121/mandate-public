import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bounties, contractDeployments } from "@/db/schema";
import { requireUserId, routeError } from "@/lib/auth";
import { clientWallet } from "@/lib/client-wallet";
import { assertPaymentNetwork, fail } from "@/lib/arc-safety";
import { confirmEscrow, providerAgent, sendEscrow, transactionStatus, type Bounty } from "@/lib/escrow-transactions";
import { ARC } from "@/lib/arc";
import { assertChainWritesEnabled } from "@/lib/chain-write-control";
async function accessible(owner: string, id: string) {
  const row = (await getDb().select().from(bounties).where(eq(bounties.id, id)).limit(1))[0];
  if (!row) fail("Bounty not found", 404);
  if (row.ownerId !== owner && (await providerAgent(row)).ownerId !== owner) fail("Bounty not found", 404);
  return row;
}
function view(row: Bounty) {
  const hash = row.refundTxHash || row.completeTxHash || row.rejectTxHash || row.submitTxHash || row.fundTxHash;
  return { ...row, refundable: row.status === "rejected" || (["funded", "submitted", "revision_requested"].includes(row.status) && Date.parse(row.deadline) <= Date.now()), explorerUrl: hash ? `${(row.chainId === 5042 ? ARC.mainnet : ARC.testnet).explorerUrl}/tx/${hash}` : null };
}
async function digest(value: string) {
  return `0x${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), b => b.toString(16).padStart(2, "0")).join("")}`;
}
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = requireUserId(request), { id } = await context.params;
    const bounty = await accessible(owner, id);
    return Response.json({ bounty: view(bounty), transaction: await transactionStatus(bounty, false) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return routeError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = requireUserId(request), { id } = await context.params;
    const bounty = await accessible(owner, id);
    assertPaymentNetwork(bounty.chainId);
    const body = await request.json() as { action?: "submit" | "approve" | "reject" | "refund" | "reconcile"; deliverable?: string; note?: string; resultUrl?: string; deliverySummary?: string; deliveryNotes?: string };
    const agent = await providerAgent(bounty);
    if (body.action === "reconcile") {
      if (bounty.settlementStage === "submit_pending" ? agent.ownerId !== owner : bounty.ownerId !== owner) fail("Only the action owner can reconcile", 403);
      await confirmEscrow(bounty, false);
      return Response.json({ bounty: view(await accessible(owner, id)) });
    }
    if (body.action === "submit") { if (agent.ownerId !== owner) fail("Only the selected agent owner can submit", 403); }
    else { if (bounty.ownerId !== owner) fail("Only the client can settle", 403); }
    assertChainWritesEnabled(bounty.chainId);
    if (bounty.currentTransactionId || bounty.settlementTransactionId) fail("Reconcile the active transaction before another action");
    if (!bounty.contractAddress || !bounty.onchainJobId) fail("Escrow job binding unavailable");
    const deployment = (await getDb().select().from(contractDeployments).where(and(eq(contractDeployments.chainId, bounty.chainId), eq(contractDeployments.contractAddress, bounty.contractAddress), eq(contractDeployments.status, "complete"))).limit(1))[0];
    if (!deployment) fail("Network-scoped deployment binding unavailable");
    const expired = Date.parse(bounty.deadline) <= Date.now();
    let stage: string, signature: string, parameters: string[], extra: Partial<Bounty> = {};
    const payer = body.action === "submit" ? null : await clientWallet(bounty);
    const walletId = body.action === "submit" ? agent.walletId : payer?.walletId;
    const address = body.action === "submit" ? agent.walletAddress : payer?.address;
    if (!walletId || !address) fail("Signer unavailable", 503);
    if (body.action === "submit" && bounty.status === "funded" && !expired) {
      const deliverable = body.deliverable?.trim();
      if (!deliverable || deliverable.length < 3 || deliverable.length > 6000) fail("Provide a deliverable of 3–6000 characters", 400);
      if (body.resultUrl) { try { if (!["https:", "http:"].includes(new URL(body.resultUrl).protocol)) fail("Invalid result URL", 400); } catch { fail("Invalid result URL", 400); } }
      if ((body.deliverySummary?.length ?? 0) > 4000 || (body.deliveryNotes?.length ?? 0) > 2000) fail("Delivery text too long", 400);
      const hash = await digest(deliverable); stage = "submit_pending"; signature = "submit(uint256,bytes32,bytes)"; parameters = [bounty.onchainJobId, hash, "0x"];
      extra = { deliverable, deliverableHash: hash, resultUrl: body.resultUrl || null, deliverySummary: body.deliverySummary || deliverable, deliveryNotes: body.deliveryNotes || null };
    } else if ((body.action === "approve" || body.action === "reject") && bounty.status === "submitted" && !expired) {
      stage = body.action === "approve" ? "complete_pending" : "reject_pending"; signature = body.action === "approve" ? "complete(uint256,bytes32,bytes)" : "reject(uint256,bytes32,bytes)";
      parameters = [bounty.onchainJobId, await digest(body.note?.trim().slice(0, 2000) || body.action), "0x"];
    } else if (body.action === "refund" && (bounty.status === "rejected" || (expired && ["funded", "submitted", "revision_requested"].includes(bounty.status)))) {
      stage = "refund_pending"; signature = "refund(uint256)"; parameters = [bounty.onchainJobId];
    } else fail("Action unavailable for this state or deadline");
    await sendEscrow(request, owner, bounty, stage, walletId, address, bounty.contractAddress, signature, parameters, extra);
    return Response.json({ bounty: view(await accessible(owner, id)) }, { status: 202 });
  } catch (error) { return routeError(error); }
}
