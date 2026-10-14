import "server-only";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { Interface, getCreateAddress, keccak256 } from "ethers";
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import { getDb } from "@/db";
import { contractDeployments, financialOperations } from "@/db/schema";
import artifact from "@/contracts/artifacts/BountyEscrow.json";
import { requireTreasuryOperator } from "./treasury-authorization";
import { circleClient } from "./escrow-transactions";
import { claimOperation, uncertainOperation } from "./financial-operations";
import { TESTNET, USDC, assertTestnet, fail, rpc, testnetRpc, verifyRpc } from "./arc-safety";

export function assertDeploymentEnabled(chain: number = TESTNET) {
  assertTestnet(chain);
  if (env.ESCROW_DEPLOYMENT_ENABLED !== "testnet-approved") fail("Testnet deployment is paused", 423);
}

const CREATION_HASH = "0xca2e4c2df5b435d7f3b07cc178b0f11ba493bc2f5405be722d5167d641d48ed4";
const RUNTIME_HASH = "0xe1943c654c7c6bef039bd60ba376008740c5a226a86ef7e6c3f399b1c87d8346";
const initcode = () => {
  if (keccak256(artifact.bytecode) !== CREATION_HASH) fail("Reviewed V2 artifact changed", 503);
  return artifact.bytecode + USDC.slice(2).padStart(64, "0");
};
const platform = () => {
  if (!env.CIRCLE_API_KEY || !env.CIRCLE_ENTITY_SECRET) fail("Circle configuration unavailable", 503);
  return initiateSmartContractPlatformClient({ apiKey: env.CIRCLE_API_KEY, entitySecret: env.CIRCLE_ENTITY_SECRET });
};
export async function deploymentPreflight(owner: string) {
  await requireTreasuryOperator(owner, TESTNET);
  const walletId = env.CIRCLE_PRIMARY_WALLET_ID, address = env.CIRCLE_PRIMARY_WALLET_ADDRESS;
  if (!walletId || !address) fail("Configured Testnet signer unavailable", 503);
  const endpoint = testnetRpc(env.ARC_RPC_URL);
  await verifyRpc(endpoint, TESTNET);
  const wallet = (await circleClient().getWallet({ id: walletId })).data?.wallet;
  if (!wallet || wallet.blockchain !== "ARC-TESTNET" || wallet.accountType !== "EOA" || wallet.address.toLowerCase() !== address.toLowerCase()) fail("Testnet EOA signer metadata mismatch");
  if (await rpc<string>(endpoint, "eth_getCode", [address, "latest"]) !== "0x") fail("Deployment requires the reviewed direct EOA path");
  const gas = BigInt(await rpc<string>(endpoint, "eth_estimateGas", [{ from: address, data: initcode(), value: "0x0" }]));
  const gasPrice = BigInt(await rpc<string>(endpoint, "eth_gasPrice", []));
  const balance = BigInt(await rpc<string>(endpoint, "eth_getBalance", [address, "latest"]));
  if (balance < gas * gasPrice * 2n) fail("Insufficient Testnet balance for deployment safety margin");
  return { chainId: TESTNET, signer: address, estimatedGas: gas.toString(), estimatedFeeTestUSDC: (Number(gas * gasPrice) / 1e18).toString(), signerBalanceTestUSDC: (Number(balance) / 1e18).toString(), artifactHash: CREATION_HASH, expectedRuntimeHash: RUNTIME_HASH };
}
async function existing(owner: string) {
  return (await getDb().select().from(contractDeployments).where(and(eq(contractDeployments.ownerId, owner), eq(contractDeployments.kind, "bounty_escrow"), eq(contractDeployments.chainId, TESTNET), eq(contractDeployments.contractVersion, 2))).limit(1))[0];
}
export async function deployV2(request: Request, owner: string) {
  assertDeploymentEnabled(TESTNET);
  const preflight = await deploymentPreflight(owner);
  const previous = await existing(owner);
  if (previous) return { status: previous.status, message: "Existing V2 deployment: reconcile it, do not deploy again." };
  const operation = await claimOperation(request, owner, TESTNET, `deployment:${owner}:v2`, "deploy_v2", { artifactHash: CREATION_HASH, signer: preflight.signer, usdc: USDC });
  if (!operation.fresh) return { status: "pending", message: "Reconcile existing deployment" };
  // Reserve the version BEFORE external submission. A crash/unknown send must
  // leave this durable row and operation locked; never automatically retry.
  await getDb().insert(contractDeployments).values({ id: operation.id, ownerId: owner, kind: "bounty_escrow", chainId: TESTNET, contractVersion: 2, circleContractId: "", transactionId: "", status: "pending" });
  try {
    assertDeploymentEnabled(TESTNET); // final boundary, after awaited checks
    const response = await platform().deployContract({ name: "Mandate BountyEscrow V2 Testnet", walletId: env.CIRCLE_PRIMARY_WALLET_ID!, blockchain: "ARC-TESTNET", abiJson: JSON.stringify(artifact.abi), bytecode: artifact.bytecode, constructorParameters: [USDC], idempotencyKey: operation.circle_key, refId: `mandate:v2:${operation.id}`, fee: { type: "level", config: { feeLevel: "MEDIUM" } } });
    if (!response.data?.contractId || !response.data.transactionId) throw Error("Missing deployment identifiers");
    await getDb().batch([
      getDb().update(contractDeployments).set({ circleContractId: response.data.contractId, transactionId: response.data.transactionId }).where(eq(contractDeployments.id, operation.id)),
      getDb().update(financialOperations).set({ status: "submitted", transactionId: response.data.transactionId }).where(eq(financialOperations.id, operation.id)),
    ]);
    return { status: "pending", message: "Submitted once; verify receipt before funding." };
  } catch (error) {
    if (error instanceof Response && error.status === 423) {
      await getDb().batch([getDb().update(financialOperations).set({ status: "failed" }).where(eq(financialOperations.id, operation.id)), getDb().update(contractDeployments).set({ status: "failed", failureReason: "Send boundary disabled; no SDK call made" }).where(eq(contractDeployments.id, operation.id))]);
      throw error;
    }
    await uncertainOperation(operation.id);
    fail("Deployment outcome uncertain. Do not resend; inspect the original provider request.", 503);
  }
}
export async function reconcileV2(owner: string) {
  await requireTreasuryOperator(owner, TESTNET);
  const record = await existing(owner);
  if (!record) fail("No V2 deployment was submitted. Complete signer check and deploy first.");
  if (!record?.transactionId || !record.circleContractId) fail("No submitted deployment identifiers. Manual investigation required.");
  const tx = (await circleClient().getTransaction({ id: record.transactionId })).data?.transaction;
  if (tx?.state !== "COMPLETE" || !tx.txHash) fail("Deployment is not confirmed; no new transaction sent");
  const endpoint = testnetRpc(env.ARC_RPC_URL); await verifyRpc(endpoint, TESTNET);
  const receipt = await rpc<{ status: string; from: string; to: string | null; contractAddress: string; transactionHash: string } | null>(endpoint, "eth_getTransactionReceipt", [tx.txHash]);
  const transaction = await rpc<{ from: string; to: string | null; input: string; nonce: string; value: string; chainId: string; hash: string } | null>(endpoint, "eth_getTransactionByHash", [tx.txHash]);
  if (!receipt || !transaction || receipt.status !== "0x1" || receipt.to !== null || transaction.to !== null || receipt.transactionHash.toLowerCase() !== tx.txHash.toLowerCase() || transaction.hash.toLowerCase() !== tx.txHash.toLowerCase() || Number(BigInt(transaction.chainId)) !== TESTNET || BigInt(transaction.value) !== 0n || receipt.from.toLowerCase() !== env.CIRCLE_PRIMARY_WALLET_ADDRESS?.toLowerCase() || transaction.from.toLowerCase() !== receipt.from.toLowerCase() || transaction.input.toLowerCase() !== initcode().toLowerCase()) fail("Deployment receipt/transaction mismatch");
  const predicted = getCreateAddress({ from: transaction.from, nonce: BigInt(transaction.nonce) });
  if (receipt.contractAddress?.toLowerCase() !== predicted.toLowerCase()) fail("Deployment address mismatch");
  const code = await rpc<string>(endpoint, "eth_getCode", [predicted, "latest"]);
  if (keccak256(code) !== RUNTIME_HASH) fail("Deployed runtime does not match reviewed V2");
  const token = new Interface(["function usdc() view returns(address)"]);
  const asset = await rpc<string>(endpoint, "eth_call", [{ to: predicted, data: token.encodeFunctionData("usdc") }, "latest"]);
  if (token.decodeFunctionResult("usdc", asset)[0].toLowerCase() !== USDC) fail("Deployed asset mismatch");
  const metadata = (await platform().getContract({ id: record.circleContractId })).data?.contract;
  if (metadata?.blockchain !== "ARC-TESTNET" || metadata.contractAddress?.toLowerCase() !== predicted.toLowerCase() || metadata.deploymentTransactionId !== record.transactionId) fail("Circle deployment metadata mismatch");
  await getDb().batch([getDb().update(contractDeployments).set({ status: "complete", contractAddress: predicted, txHash: tx.txHash, updatedAt: new Date().toISOString() }).where(and(eq(contractDeployments.id, record.id), eq(contractDeployments.status, "pending"))), getDb().update(financialOperations).set({ status: "complete" }).where(and(eq(financialOperations.id, record.id), eq(financialOperations.status, "submitted")))]);
  return { status: "complete", chainId: TESTNET, contractAddress: predicted, txHash: tx.txHash, runtimeHash: RUNTIME_HASH, explorerUrl: `https://explorer.testnet.arc.io/tx/${tx.txHash}` };
}
