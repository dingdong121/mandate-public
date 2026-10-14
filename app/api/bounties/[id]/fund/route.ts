import { env } from "cloudflare:workers";
import { and, eq, desc } from "drizzle-orm";
import { Interface } from "ethers";
import { getDb } from "@/db";
import { bounties, contractDeployments, financialOperations } from "@/db/schema";
import { requireUserId, routeError } from "@/lib/auth";
import { clientWallet } from "@/lib/client-wallet";
import { assertPaymentNetwork, fail, rpc, USDC, validExpiry } from "@/lib/arc-safety";
import { paymentNetwork } from "@/lib/payment-network";
import { recoverCreateJob, confirmEscrow, providerAgent, sendEscrow, transactionStatus, paymentRpc, type Bounty } from "@/lib/escrow-transactions";
import { readCircleTransactions } from "@/lib/circle-transaction-read";
import { ARC } from "@/lib/arc";
import { assertChainWritesEnabled } from "@/lib/chain-write-control";
async function owned(owner: string, id: string) {
  const row = (await getDb().select().from(bounties).where(and(eq(bounties.id, id), eq(bounties.ownerId, owner))).limit(1))[0];
  if (!row) fail("Bounty not found", 404);
  return row;
}
function view(row: Bounty) {
  const hash = row.fundTxHash || row.approveTxHash || row.setBudgetTxHash || row.createJobTxHash;
  return { ...row, explorerUrl: hash ? `${(row.chainId === 5042 ? ARC.mainnet : ARC.testnet).explorerUrl}/tx/${hash}` : null };
}
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = requireUserId(request), { id } = await context.params;
    const bounty = await owned(owner, id);
    if (new URL(request.url).searchParams.get("diagnose") === "1") {
      assertPaymentNetwork(bounty.chainId);
      const payer = await clientWallet(bounty);
      const operation = (await getDb().select().from(financialOperations).where(and(eq(financialOperations.ownerId, owner), eq(financialOperations.chainId, bounty.chainId), eq(financialOperations.resource, `bounty:${id}`), eq(financialOperations.status, "uncertain"))).limit(1))[0];
      if (!operation) return Response.json({ status: "no_uncertain_operation" }, { headers: { "cache-control": "no-store" } });
      const reference = `mandate:${bounty.chainId}:${id}:${operation.action}:${operation.id}`;
      // Bounded read, not a resend or automatic unlock. No match is NOT proof of rejection.
      const response = await readCircleTransactions(payer.walletId,bounty.chainId);
      if (!response.ok) return Response.json({ error: "Circle read-only lookup failed", ...response, databaseChanged: false, transactionSent: false }, { status: 503, headers: { "cache-control": "no-store" } });
      const matches = response.transactions.filter(tx => (tx.refId === reference || tx.refId === operation.id) && tx.blockchain === paymentNetwork(bounty.chainId).blockchain);
      return Response.json({ operationId: operation.id, action: operation.action, reference, status: operation.status, inspectedCount: response.transactions.length, boundedPage: true, matches: matches.map(tx => ({ id: tx.id, state: tx.state, txHash: tx.txHash, blockchain: tx.blockchain, contractAddress: tx.contractAddress })), noMatchIsNotProof: true, databaseChanged: false, transactionSent: false }, { headers: { "cache-control": "no-store" } });
    }
    return Response.json({ bounty: view(bounty), transaction: await transactionStatus(bounty, true) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return routeError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = requireUserId(request), { id } = await context.params;
    let bounty = await owned(owner, id);
    assertPaymentNetwork(bounty.chainId);
    const body = await request.json() as { action?: "execute" | "reconcile" | "recover_original"; payerAgentId?: string };
    if (body.action === "recover_original") return Response.json(await recoverCreateJob(owner, bounty), { headers: { "cache-control": "no-store" } });
    if (body.action === "reconcile") {
      await confirmEscrow(bounty, true);
      return Response.json({ bounty: view(await owned(owner, id)) });
    }
    if (body.action !== "execute") fail("Explicit execute or reconcile action required", 400);
    assertChainWritesEnabled(bounty.chainId);
    if (bounty.fundingStage === "funded") return Response.json({ bounty: view(bounty) });
    if (bounty.currentTransactionId || bounty.settlementTransactionId) fail("Reconcile the active transaction before sending another");
    if (!bounty.providerAgentId || bounty.status !== "draft") fail("Select an agent before funding");
    if (!Number.isSafeInteger(bounty.rewardMicros) || bounty.rewardMicros <= 0) fail("Invalid USDC amount", 400);
    const expiry = validExpiry(bounty.deadline), agent = await providerAgent(bounty);
    const payer = await clientWallet(bounty, body.payerAgentId, true);
    const deployment = (await getDb().select().from(contractDeployments).where(and(eq(contractDeployments.chainId, bounty.chainId), eq(contractDeployments.kind, "bounty_escrow"), eq(contractDeployments.status, "complete"), ...(bounty.contractAddress ? [eq(contractDeployments.contractAddress, bounty.contractAddress)] : []))).orderBy(desc(contractDeployments.contractVersion)).limit(1))[0];
    if (!deployment?.contractAddress || (bounty.contractAddress && bounty.contractAddress.toLowerCase() !== deployment.contractAddress.toLowerCase())) fail("Network-scoped escrow binding does not match");
    if (deployment.contractVersion < 2 && bounty.fundingStage === "draft") fail("New jobs on the legacy escrow are paused pending owner-approved V2 deployment", 423);
    bounty = { ...bounty, contractAddress: deployment.contractAddress };
    const stage = bounty.fundingStage === "draft" ? "create_job_pending" : bounty.fundingStage;
    let signature: string, parameters: string[], target = bounty.contractAddress!;
    if (stage === "create_job_pending") {
      signature = "createJob(address,address,uint256,string,address)";
      parameters = [agent.walletAddress!, payer.address, String(expiry), bounty.objective, "0x0000000000000000000000000000000000000000"];
    } else if (stage === "budget_pending" && bounty.onchainJobId) {
      signature = "setBudget(uint256,uint256,bytes)"; parameters = [bounty.onchainJobId, String(bounty.rewardMicros), "0x"];
    } else if (stage === "approve_pending") {
      signature = "approve(address,uint256)"; parameters = [target, String(bounty.rewardMicros)]; target = USDC;
    } else if (stage === "fund_pending" && bounty.onchainJobId) {
      const erc20 = new Interface(["function allowance(address,address) view returns(uint256)"]);
      const allowance = await rpc<string>(paymentRpc(bounty.chainId), "eth_call", [{ to: USDC, data: erc20.encodeFunctionData("allowance", [payer.address, target]) }, "latest"]);
      if (BigInt(allowance) < BigInt(bounty.rewardMicros)) fail("Escrow USDC allowance is insufficient");
      signature = "fund(uint256,bytes)"; parameters = [bounty.onchainJobId, "0x"];
    } else fail("Funding stage requires manual reconciliation");
    await sendEscrow(request, owner, bounty, stage, payer.walletId, payer.address, target, signature, parameters, { contractAddress: deployment.contractAddress });
    return Response.json({ bounty: view(await owned(owner, id)) }, { status: 202 });
  } catch (error) { return routeError(error); }
}
