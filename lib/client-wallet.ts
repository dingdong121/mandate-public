import "server-only";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, agentWalletBindings, bountyClientWallets } from "@/db/schema";
import { assertPaymentNetwork, fail, TESTNET } from "./arc-safety";
import { requireTreasuryOperator } from "./treasury-authorization";
import type { Bounty } from "./escrow-transactions";

// No frontend wallet ID or address is ever used. The caller selects only a profile.
export async function clientWallet(bounty: Bounty, payerAgentId?: string, pin = false) {
  assertPaymentNetwork(bounty.chainId);
  const db = getDb();
  const existing = (await db.select().from(bountyClientWallets).where(eq(bountyClientWallets.bountyId, bounty.id)).limit(1))[0];
  if (existing) {
    if (existing.ownerId !== bounty.ownerId || existing.chainId !== bounty.chainId || (payerAgentId && payerAgentId !== existing.agentId)) fail("Task funding wallet cannot be changed", 403);
    await ownedBinding(bounty, existing.agentId, existing.walletId, existing.walletAddress);
    return { walletId: existing.walletId, address: existing.walletAddress, agentId: existing.agentId, legacy: false };
  }
  // Compatibility for already-bound historical jobs only, never a new-job fallback.
  if (bounty.chainId === TESTNET && bounty.onchainJobId && bounty.contractAddress && bounty.createJobTxHash) {
    await requireTreasuryOperator(bounty.ownerId, bounty.chainId);
    if (!env.CIRCLE_PRIMARY_WALLET_ID || !env.CIRCLE_PRIMARY_WALLET_ADDRESS) fail("Historical signer unavailable", 503);
    return { walletId: env.CIRCLE_PRIMARY_WALLET_ID, address: env.CIRCLE_PRIMARY_WALLET_ADDRESS, agentId: null, legacy: true };
  }
  if (!payerAgentId) fail("Choose your own connected Circle Agent Account to fund this bounty", 400);
  const binding = await ownedBinding(bounty, payerAgentId);
  if (pin) {
    await db.insert(bountyClientWallets).values({ bountyId: bounty.id, ownerId: bounty.ownerId, chainId: bounty.chainId, agentId: payerAgentId, walletId: binding.walletId, walletAddress: binding.walletAddress }).onConflictDoNothing();
    return clientWallet(bounty, payerAgentId);
  }
  return { walletId: binding.walletId, address: binding.walletAddress, agentId: payerAgentId, legacy: false };
}

async function ownedBinding(bounty: Bounty, agentId: string, walletId?: string, address?: string) {
  const db=getDb();
  const agent=(await db.select().from(agents).where(and(eq(agents.id,agentId),eq(agents.ownerId,bounty.ownerId),eq(agents.chainId,bounty.chainId))).limit(1))[0];
  const binding=(await db.select().from(agentWalletBindings).where(and(eq(agentWalletBindings.agentId,agentId),eq(agentWalletBindings.ownerId,bounty.ownerId),eq(agentWalletBindings.chainId,bounty.chainId))).limit(1))[0];
  if (!agent || agent.walletProvider !== "circle" || !binding || agent.walletId !== binding.walletId || agent.walletAddress?.toLowerCase() !== binding.walletAddress.toLowerCase() || (walletId && walletId !== binding.walletId) || (address && address.toLowerCase() !== binding.walletAddress.toLowerCase())) fail("Funding wallet is not bound to this publisher and network",403);
  return binding;
}
