import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { getDb } from "@/db";
import { agents, bounties, financialOperations, fundingSessions, contractDeployments } from "@/db/schema";
import { claimOperation, reconcileOperation, uncertainOperation } from "./financial-operations";
import { assertChainWritesEnabled, guardedChainWrite } from "./chain-write-control";
import { circleDiagnostic } from "./circle-diagnostic";
import { clientWallet } from "./client-wallet";
import { assertPaymentNetwork, fail, jobIdFromReceipt, receiptEvent, rpc, validateReceipt, validateUsdcTransfer, verifyRpc, USDC, type Receipt } from "./arc-safety";
import { paymentCredentials, paymentNetwork } from "./payment-network";
import { assertMainnetTestScope } from './mainnet-test-scope';
import {executionFee} from './mainnet-test-fee';
import {simulateMainnetResponseLoss} from './mainnet-response-loss';

export type Bounty = typeof bounties.$inferSelect;
export function circleClient(chainId = 5042002) {
  const credentials=paymentCredentials(chainId,env);
  return initiateDeveloperControlledWalletsClient({ apiKey: credentials.apiKey, entitySecret: credentials.entitySecret });
}
export function paymentRpc(chainId: number) { return paymentCredentials(chainId,env).rpcUrl; }
export async function providerAgent(bounty: Bounty) {
  if (!bounty.providerAgentId) fail("Select an agent before an escrow operation");
  const agent = (await getDb().select().from(agents).where(eq(agents.id, bounty.providerAgentId)).limit(1))[0];
  if (!agent || agent.chainId !== bounty.chainId || agent.walletProvider !== "circle" || !agent.walletId || !agent.walletAddress) fail("Agent wallet network does not match the bounty");
  return agent;
}
export async function validateSigner(bounty: Bounty, walletId: string, address: string) {
  assertPaymentNetwork(bounty.chainId);
  await verifyRpc(paymentRpc(bounty.chainId), bounty.chainId);
  const wallet = (await circleClient(bounty.chainId).getWallet({ id: walletId })).data?.wallet;
  if (!wallet || wallet.id !== walletId || wallet.blockchain !== paymentNetwork(bounty.chainId).blockchain || wallet.address.toLowerCase() !== address.toLowerCase()) fail("Circle signer/network mismatch");
  if (!bounty.contractAddress || await rpc<string>(paymentRpc(bounty.chainId), "eth_getCode", [bounty.contractAddress, "latest"]) === "0x") fail("Escrow bytecode unavailable");
}
export async function sendEscrow(request: Request, owner: string, bounty: Bounty, stage: string, walletId: string, signer: string, target: string, signature: string, parameters: string[], extra: Partial<Bounty> = {}) {
  assertMainnetTestScope(bounty,stage);
  assertChainWritesEnabled(bounty.chainId);
  await validateSigner(bounty, walletId, signer);
  const funding = ["create_job_pending", "budget_pending", "approve_pending", "fund_pending"].includes(stage);
  if (funding) {
    await getDb().insert(fundingSessions).values({ chainId: bounty.chainId, walletId, bountyId: bounty.id }).onConflictDoNothing();
    const session = (await getDb().select().from(fundingSessions).where(and(eq(fundingSessions.chainId, bounty.chainId), eq(fundingSessions.walletId, walletId))).limit(1))[0];
    if (session?.bountyId !== bounty.id) fail("Finish the active funding session for this signer before funding another bounty");
  }
  let operation;
  // A manual Submit click may recover ONLY the same owner's same payload with
  // the original provider key. Never clear a lock or generate a replacement key.
  const pending = stage === "submit_pending" ? (await getDb().select().from(financialOperations).where(and(eq(financialOperations.ownerId, owner), eq(financialOperations.chainId, bounty.chainId), eq(financialOperations.resource, `bounty:${bounty.id}`), eq(financialOperations.action, stage), eq(financialOperations.status, "uncertain"))).limit(1))[0] : null;
  if (pending) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ resource: `bounty:${bounty.id}`, action: stage, payload: { walletId, target, signature, parameters } })));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    if (pending.transactionId || hash !== pending.payloadHash) fail("Original submission is locked. Restore the exact original Result URL and Delivery summary before recovery; do not submit different work.");
    const claimed = await env.DB!.prepare("UPDATE financial_operations SET status='claimed' WHERE id=? AND owner_id=? AND status='uncertain' AND transaction_id IS NULL RETURNING id").bind(pending.id, owner).first();
    if (!claimed) fail("Original submission recovery is already active; do not resend");
    operation = { id: pending.id, circle_key: pending.circleKey, fresh: true };
  } else {
    operation = await claimOperation(request, owner, bounty.chainId, `bounty:${bounty.id}`, stage, { walletId, target, signature, parameters });
  }
  if (!operation.fresh) return;
  const current = (await getDb().select().from(bounties).where(eq(bounties.id, bounty.id)).limit(1))[0];
  if (!current || current.updatedAt !== bounty.updatedAt || current.status !== bounty.status || current.fundingStage !== bounty.fundingStage || current.settlementStage !== bounty.settlementStage || current.providerAgentId !== bounty.providerAgentId || current.currentTransactionId || current.settlementTransactionId) {
    await getDb().update(financialOperations).set({ status: "failed" }).where(eq(financialOperations.id, operation.id));
    fail("Bounty state changed; review it before another action");
  }
  try {
    const fee=await executionFee(bounty,stage,operation.id);
    const response = await guardedChainWrite(bounty.chainId, () => circleClient(bounty.chainId).createContractExecutionTransaction({ idempotencyKey: operation.circle_key, walletId, contractAddress: target, abiFunctionSignature: signature, abiParameters: parameters, fee, refId: operation.id }));
    const transactionId = response.data?.id;
    if (!transactionId) throw new Error("Missing transaction ID");
    await simulateMainnetResponseLoss(bounty,stage,operation.id);
    // Controlled recovery drill: server-only, exact dedicated Testnet bounty,
    // payment stage only. NEVER active on Mainnet or ordinary tasks. Simulates
    // response loss after provider acceptance and before app ID persistence.
    if (bounty.chainId === 5042002 && stage === "complete_pending" && bounty.title.startsWith("MVP recovery drill") && env.TESTNET_RESPONSE_LOSS_BOUNTY_ID === bounty.id) {
      throw new Error("Controlled Testnet post-acceptance response loss");
    }
    await getDb().batch([
      getDb().update(bounties).set({ ...extra, ...(funding ? { fundingStage: stage as Bounty["fundingStage"], currentTransactionId: transactionId, currentIdempotencyKey: operation.circle_key, fundingError: null } : { settlementStage: stage as Bounty["settlementStage"], settlementTransactionId: transactionId, settlementIdempotencyKey: operation.circle_key, settlementError: null }), updatedAt: new Date().toISOString() }).where(and(eq(bounties.id, bounty.id), eq(bounties.updatedAt, bounty.updatedAt))),
      getDb().update(financialOperations).set({ status: "submitted", transactionId }).where(eq(financialOperations.id, operation.id)),
    ]);
  } catch (error) {
    const diagnostic = circleDiagnostic(error);
    console.error("Escrow submission diagnostic", { operationId: operation.id, stage, ...diagnostic });
    if (error instanceof Response && error.status === 423) {
      // The final guard rejected BEFORE the SDK call, not an uncertain send.
      await getDb().update(financialOperations).set({ status: "failed" }).where(eq(financialOperations.id, operation.id));
      throw error;
    }
    await uncertainOperation(operation.id);
    if (diagnostic.httpStatus === 400 && diagnostic.providerCode === 155258) fail(`${stage === "submit_pending" ? "The Agent wallet" : "The signing wallet"} does not have enough USDC to pay gas. Network: ${bounty.chainId === 5042 ? "Arc Mainnet. Add USDC on Arc Mainnet to this wallet; test tokens cannot be used." : "Arc Testnet. Get free test USDC at https://faucet.circle.com/ for this wallet."} This request does not release escrow funds. For a delivery submission, retry manually with the exact same delivery after funding; the original transaction key will be reused.`, 409);
    fail("Submission outcome uncertain. No automatic retry; owner reconciliation is required", 503);
  }
}
// Manual recovery only, using Circle's original exactly-once key. Never unlock
// an ambiguous operation and never substitute a newly generated provider key.
export async function recoverCreateJob(owner: string, bounty: Bounty) {
  assertChainWritesEnabled(bounty.chainId);
  if (bounty.ownerId !== owner || bounty.status !== "draft" || bounty.fundingStage !== "draft" || bounty.currentTransactionId || bounty.onchainJobId) fail("Original create-job recovery is not applicable");
  const operation = (await getDb().select().from(financialOperations).where(and(eq(financialOperations.ownerId, owner), eq(financialOperations.chainId, bounty.chainId), eq(financialOperations.resource, `bounty:${bounty.id}`), eq(financialOperations.action, "create_job_pending"), eq(financialOperations.status, "uncertain"))).limit(1))[0];
  if (!operation || operation.transactionId) fail("No uncertain original create-job request to recover");
  const payer = await clientWallet(bounty);
  const walletId = payer.walletId, signer = payer.address;
  const agent = await providerAgent(bounty);
  const expiry = Math.floor(new Date(bounty.deadline).getTime() / 1000);
  if (!Number.isSafeInteger(expiry) || expiry <= Date.now() / 1000) fail("Original deadline is no longer valid");
  const signature = "createJob(address,address,uint256,string,address)";
  const parameters = [agent.walletAddress!, signer, String(expiry), bounty.objective, "0x0000000000000000000000000000000000000000"];
  const deployments = await getDb().select().from(contractDeployments).where(and(eq(contractDeployments.chainId, bounty.chainId), eq(contractDeployments.kind, "bounty_escrow"), eq(contractDeployments.status, "complete"), eq(contractDeployments.contractVersion, 2)));
  let target: string | null = null;
  for (const deployment of deployments) {
    if (!deployment.contractAddress) continue;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ resource: operation.resource, action: operation.action, payload: { walletId, target: deployment.contractAddress, signature, parameters } })));
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    if (hash === operation.payloadHash) target = deployment.contractAddress;
  }
  if (!target) fail("Original payload hash mismatch; recovery refused");
  const original = { ...bounty, contractAddress: target };
  await validateSigner(original, walletId, signer);
  const session = (await getDb().select().from(fundingSessions).where(and(eq(fundingSessions.chainId, bounty.chainId), eq(fundingSessions.walletId, walletId))).limit(1))[0];
  if (session?.bountyId !== bounty.id) fail("Original signer funding session does not match");
  const claimed = await env.DB!.prepare("UPDATE financial_operations SET status='claimed' WHERE id=? AND owner_id=? AND status='uncertain' AND transaction_id IS NULL RETURNING id").bind(operation.id, owner).first();
  if (!claimed) fail("Recovery already active; do not resend");
  try {
    // Correct rejected metadata only. Never change the provider idempotency key
    // or verified business payload; a provider conflict must remain locked.
    const fee=await executionFee(bounty,'create_job_pending',operation.id);
    const response = await guardedChainWrite(bounty.chainId, () => circleClient(bounty.chainId).createContractExecutionTransaction({ idempotencyKey: operation.circleKey, walletId, contractAddress: target!, abiFunctionSignature: signature, abiParameters: parameters, fee, refId: operation.id }));
    const id = response.data?.id;
    if (!id) throw new Error("Missing original transaction identifier");
    await getDb().batch([
      getDb().update(bounties).set({ contractAddress: target, fundingStage: "create_job_pending", currentTransactionId: id, currentIdempotencyKey: operation.circleKey, fundingError: null, updatedAt: new Date().toISOString() }).where(and(eq(bounties.id, bounty.id), eq(bounties.ownerId, owner), eq(bounties.updatedAt, bounty.updatedAt))),
      getDb().update(financialOperations).set({ status: "submitted", transactionId: id }).where(eq(financialOperations.id, operation.id)),
    ]);
    return { status: "submitted", transactionId: id, reusedOriginalKey: true, referenceMetadataCorrected: true };
  } catch (error) {
    const diagnostic = circleDiagnostic(error);
    console.error("Original request recovery diagnostic", { operationId: operation.id, ...diagnostic });
    await uncertainOperation(operation.id);
    return { status: "uncertain", ...diagnostic, reusedOriginalKey: true, message: "Original request could not be recovered. Do not create a new request." };
  }
}
export async function transactionStatus(bounty: Bounty, funding: boolean) {
  const id = funding ? bounty.currentTransactionId : bounty.settlementTransactionId;
  if (!id) return null;
  // Reading Circle transaction metadata does not write database or blockchain.
  const transaction = (await circleClient(bounty.chainId).getTransaction({ id })).data?.transaction;
  return transaction ? { id, state: transaction.state, txHash: transaction.txHash } : null;
}
export async function confirmEscrow(bounty: Bounty, funding: boolean) {
  assertPaymentNetwork(bounty.chainId);
  const id = funding ? bounty.currentTransactionId : bounty.settlementTransactionId;
  if (!id) return;
  const op = await reconcileOperation(id);
  const tx = await transactionStatus(bounty, funding);
  if (tx?.state !== "COMPLETE" || !tx.txHash) fail("Transaction has not completed; no new transaction was sent");
  await verifyRpc(paymentRpc(bounty.chainId), bounty.chainId);
  const agent = await providerAgent(bounty);
  const stage = funding ? bounty.fundingStage : bounty.settlementStage;
  const approve = stage === "approve_pending";
  const signer = stage === "submit_pending" ? agent.walletAddress! : (await clientWallet(bounty)).address;
  if (!signer || !bounty.contractAddress) fail("Recorded signer or escrow unavailable");
  const target = approve ? "0x3600000000000000000000000000000000000000" : bounty.contractAddress;
  const receipt = validateReceipt(await rpc<Receipt | null>(paymentRpc(bounty.chainId), "eth_getTransactionReceipt", [tx.txHash]), tx.txHash, target, signer);
  const changes: Partial<Bounty> = { updatedAt: new Date().toISOString() };
  if (stage === "create_job_pending") {
    changes.onchainJobId = jobIdFromReceipt(receipt, bounty.contractAddress, signer, agent.walletAddress!, signer, Math.floor(new Date(bounty.deadline).getTime() / 1000), bounty.objective);
    changes.createJobTxHash = tx.txHash; changes.fundingStage = "budget_pending";
  } else if (approve) {
    const event = receiptEvent(receipt, USDC, "Approval");
    if (event.args.owner.toLowerCase() !== signer.toLowerCase() || event.args.spender.toLowerCase() !== bounty.contractAddress.toLowerCase() || event.args.value !== BigInt(bounty.rewardMicros)) fail("Approval receipt does not match escrow authorization");
    changes.approveTxHash = tx.txHash; changes.fundingStage = "fund_pending";
  } else {
    const name = ({ budget_pending: "BudgetSet", fund_pending: "Funded", submit_pending: "Submitted", complete_pending: "Completed", reject_pending: "Rejected", refund_pending: "Refunded" } as Record<string, string>)[stage];
    if (!name) fail("Unknown escrow stage");
    const event = receiptEvent(receipt, bounty.contractAddress, name);
    if (String(event.args.jobId) !== bounty.onchainJobId) fail("Receipt job ID mismatch");
    if (["BudgetSet", "Funded", "Refunded"].includes(name) && event.args.amount !== BigInt(bounty.rewardMicros)) fail("Receipt escrow amount mismatch");
    if (name === "Submitted" && event.args.deliverableHash.toLowerCase() !== bounty.deliverableHash?.toLowerCase()) fail("Receipt deliverable mismatch");
    if (name === "Funded") validateUsdcTransfer(receipt, signer, bounty.contractAddress, BigInt(bounty.rewardMicros));
    if (name === "Completed") validateUsdcTransfer(receipt, bounty.contractAddress, agent.walletAddress!, BigInt(bounty.rewardMicros));
    if (name === "Refunded") validateUsdcTransfer(receipt, bounty.contractAddress, signer, BigInt(bounty.rewardMicros));
    if (funding) {
      if (name === "BudgetSet") { changes.setBudgetTxHash = tx.txHash; changes.fundingStage = "approve_pending"; }
      else { changes.fundTxHash = tx.txHash; changes.fundingStage = "funded"; changes.status = "funded"; }
    } else {
      changes.settlementStage = name === "Completed" || name === "Refunded" ? "settled" : "idle";
      if (name === "Submitted") { changes.submitTxHash = tx.txHash; changes.status = "submitted"; }
      if (name === "Completed") { changes.completeTxHash = tx.txHash; changes.status = "completed"; }
      if (name === "Rejected") { changes.rejectTxHash = tx.txHash; changes.status = "rejected"; }
      if (name === "Refunded") { changes.refundTxHash = tx.txHash; changes.status = "expired"; }
    }
  }
  if (funding) Object.assign(changes, { currentTransactionId: null, currentIdempotencyKey: null, fundingError: null });
  else Object.assign(changes, { settlementTransactionId: null, settlementIdempotencyKey: null, settlementError: null });
  await getDb().batch([
    getDb().update(bounties).set(changes).where(and(eq(bounties.id, bounty.id), eq(funding ? bounties.currentTransactionId : bounties.settlementTransactionId, id))),
    getDb().update(financialOperations).set({ status: "complete" }).where(and(eq(financialOperations.id, op.id), eq(financialOperations.status, "submitted"))),
    ...(stage === "fund_pending" ? [getDb().delete(fundingSessions).where(and(eq(fundingSessions.chainId, bounty.chainId), eq(fundingSessions.bountyId, bounty.id)))] : []),
  ]);
}
