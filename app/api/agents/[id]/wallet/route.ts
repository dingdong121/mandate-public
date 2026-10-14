import { and, eq, isNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { agents, policies, agentWalletBindings } from "@/db/schema";
import { assertPaymentNetwork } from "@/lib/arc-safety";
import { paymentCredentials } from "@/lib/payment-network";
import { requireUserId, routeError } from "@/lib/auth";
import { CircleWalletProvider } from "@/lib/wallet-provider";
import { assertWalletCreationEnabled } from "@/lib/chain-write-control";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = requireUserId(request);
    const { id } = await context.params;
    const db = getDb();
    const agent = (await db.select().from(agents).where(and(eq(agents.id, id), eq(agents.ownerId, ownerId))).limit(1))[0];
    if (!agent) return Response.json({ error: "Agent profile not found" }, { status: 404 });
    assertPaymentNetwork(agent.chainId);
    assertWalletCreationEnabled(agent.chainId);
    if (agent.chainId===5042) {
      // Exactly one selected Agent per approved test owner. Cannot bypass by
      // creating more profiles or submitting another user's wallet/Agent ID.
      const approval=await env.DB!.prepare('SELECT owner_id FROM mainnet_wallet_test_approvals WHERE owner_id=? AND agent_id=?').bind(ownerId,id).first();
      if(!approval) return Response.json({error:'Mainnet wallet creation is limited to the two approved test accounts and their selected Agents'},{status:423});
    }
    if (agent.walletId || agent.walletAddress) return Response.json({ error: "This profile already has an Agent Account" }, { status: 409 });
    const credentials=paymentCredentials(agent.chainId,env,true);

    const key = agent.walletCreationKey || crypto.randomUUID();
    const claimed = await db.update(agents).set({ status: "creating", walletCreationKey: key }).where(and(eq(agents.id, id), eq(agents.ownerId, ownerId), eq(agents.status, "active"), isNull(agents.walletId))).returning({ id: agents.id });
    if (!claimed.length) return Response.json({ error: "Wallet connection is already in progress" }, { status: 409 });
    try {
      const wallet = await new CircleWalletProvider({ ...credentials, walletSetId: credentials.walletSetId!, idempotencyKey: key }).createWallet(agent.name);
      await db.batch([
        db.update(agents).set({ walletProvider: "circle", walletId: wallet.id, walletAddress: wallet.address, status: "active" }).where(and(eq(agents.id, id), eq(agents.ownerId, ownerId))),
        db.insert(agentWalletBindings).values({ id: crypto.randomUUID(), agentId: id, ownerId, chainId: agent.chainId, walletId: wallet.id, walletAddress: wallet.address }),
        db.insert(policies).values({ id: crypto.randomUUID(), agentId: id, dailyLimitMicros: 1_000_000, transactionLimitMicros: 100_000, dayIndex: Math.floor(Date.now() / 86_400_000) }).onConflictDoNothing(),
      ]);
      return Response.json({ agent: (await db.select().from(agents).where(eq(agents.id, id)).limit(1))[0] });
    } catch (error) {
      // Keep the claimed state/key on ambiguous outcomes. Never create another
      // wallet automatically after a network error; reconcile first.
      throw error;
    }
  } catch (error) { return routeError(error); }
}
