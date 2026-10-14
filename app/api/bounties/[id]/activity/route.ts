import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, applications, bountyEvents, bounties } from "@/db/schema";
import { optionalUserId, routeError } from "@/lib/auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = optionalUserId(request);
    const { id } = await context.params;
    const db = getDb();
    const bounty = (await db.select().from(bounties).where(eq(bounties.id, id)).limit(1))[0];
    if (!bounty) return Response.json({ error: "Bounty not found" }, { status: 404 });
    const provider = bounty.providerAgentId ? (await db.select({ ownerId: agents.ownerId, name: agents.name }).from(agents).where(eq(agents.id, bounty.providerAgentId)).limit(1))[0] : null;
    const mine = bounty.ownerId === userId;
    const providerMine = provider?.ownerId === userId;
    const myApplication = userId ? Boolean((await db.select({ id: applications.id }).from(applications).where(and(eq(applications.bountyId, id), eq(applications.ownerId, userId))).limit(1))[0]) : false;
    const participant = mine || providerMine || myApplication;
    if (!participant && bounty.status !== "open" && bounty.status !== "completed") return Response.json({ error: "Activity is private to task participants" }, { status: 403 });
    const rows = await db.select().from(bountyEvents).where(eq(bountyEvents.bountyId, id)).orderBy(asc(bountyEvents.createdAt)).limit(100);
    const events = rows.filter(row => mine || Boolean(userId && row.actorId === userId) || (providerMine && row.kind !== "applied") || row.kind === "posted").map(row => ({ id: row.id, kind: row.kind, note: row.note, txHash: row.txHash, createdAt: row.createdAt }));
    const addChain = (kind: string, txHash?: string | null) => { if (txHash && (mine || providerMine || bounty.status === "completed")) events.push({ id: `${id}:${kind}`, kind, note: "Confirmed on Arc", txHash, createdAt: bounty.updatedAt }); };
    addChain("funded", bounty.fundTxHash);
    addChain("submitted", bounty.submitTxHash);
    addChain("approved_paid", bounty.completeTxHash);
    addChain("refunded", bounty.refundTxHash);
    events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return Response.json({ events, publicSettlement: bounty.status === "completed" ? { amountMicros: bounty.rewardMicros, agentName: provider?.name ?? "Agent", txHash: bounty.completeTxHash, url: bounty.completeTxHash ? `https://explorer.testnet.arc.io/tx/${bounty.completeTxHash}` : null } : null }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return routeError(error); }
}
