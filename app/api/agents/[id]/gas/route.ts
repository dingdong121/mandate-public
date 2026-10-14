import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { getDb } from "@/db";
import { agents, financialOperations } from "@/db/schema";
import { requireUserId, routeError } from "@/lib/auth";
import { assertChainWritesEnabled } from "@/lib/chain-write-control";


function circle() {
  if (!env.CIRCLE_API_KEY || !env.CIRCLE_ENTITY_SECRET) throw new Error("Circle credentials are not configured");
  return initiateDeveloperControlledWalletsClient({ apiKey: env.CIRCLE_API_KEY, entitySecret: env.CIRCLE_ENTITY_SECRET });
}

async function ownedAgent(ownerId: string, id: string) {
  return (await getDb().select().from(agents).where(and(eq(agents.id, id), eq(agents.ownerId, ownerId))).limit(1))[0];
}

export async function POST(request: Request) {
  try { requireUserId(request); assertChainWritesEnabled(5042002); return Response.json({ error: "Gas transfers paused pending security review and owner approval" }, { status: 423 }); }
  catch (error) { return routeError(error); }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = requireUserId(request);
    const { id } = await context.params;
    const agent = await ownedAgent(ownerId, id);
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
    const transactionId = new URL(request.url).searchParams.get("transactionId");
    if (!transactionId) return Response.json({ error: "Transaction ID is required" }, { status: 400 });
    const operation = (await getDb().select().from(financialOperations).where(and(eq(financialOperations.ownerId, ownerId), eq(financialOperations.resource, `gas:${id}`), eq(financialOperations.transactionId, transactionId))).limit(1))[0];
    if (!operation) return Response.json({ error: "Transaction is not bound to this Agent" }, { status: 404 });
    const response = await circle().getTransaction({ id: transactionId });
    const transaction = response.data?.transaction;
    if (!transaction || (transaction.walletId && env.CIRCLE_PRIMARY_WALLET_ID && transaction.walletId !== env.CIRCLE_PRIMARY_WALLET_ID)) return Response.json({ error: "Gas top-up transaction not found" }, { status: 404 });
    return Response.json({ state: transaction.state, txHash: transaction.txHash ?? null, error: ["FAILED", "DENIED", "CANCELLED", "STUCK"].includes(transaction.state) ? "Transfer unsuccessful; owner review required" : null });
  } catch (error) { return routeError(error); }
}
