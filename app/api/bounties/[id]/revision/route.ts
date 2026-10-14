import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, bountyEvents, bounties } from "@/db/schema";
import { requireUserId, routeError } from "@/lib/auth";
import { localMutationLock } from "@/lib/local-mutation-lock";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = requireUserId(request);
    const { id } = await context.params;
    const body = await request.json() as { note?: string };
    const note = body.note?.trim() ?? "";
    if (note.length < 10 || note.length > 2000) return Response.json({ error: "Explain the changes needed in 10–2000 characters" }, { status: 400 });
    const db = getDb();
    const bounty = (await db.select().from(bounties).where(and(eq(bounties.id, id), eq(bounties.ownerId, userId))).limit(1))[0];
    if (!bounty || bounty.status !== "submitted" || bounty.settlementStage !== "idle" || bounty.settlementTransactionId) return Response.json({ error: "This bounty is not ready for revision review" }, { status: 409 });
    const { release } = await localMutationLock(request, userId, bounty.chainId, `bounty:${id}`, "request_revision", { note }, bounty.updatedAt, "submitted");
    await db.batch([db.update(bounties).set({ status: "revision_requested", revisionNote: note, updatedAt: new Date().toISOString() }).where(and(eq(bounties.id, id), eq(bounties.status, "submitted"), eq(bounties.updatedAt, bounty.updatedAt))), db.insert(bountyEvents).values({ id: crypto.randomUUID(), bountyId: id, actorId: userId, kind: "revision_requested", note }), release]);
    return Response.json({ status: "revision_requested" });
  } catch (error) { return routeError(error); }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = requireUserId(request);
    const { id } = await context.params;
    const body = await request.json() as { resultUrl?: string; deliverySummary?: string; deliveryNotes?: string };
    const summary = body.deliverySummary?.trim() ?? "";
    const resultUrl = body.resultUrl?.trim() ?? "";
    if (summary.length < 10 || summary.length > 4000) return Response.json({ error: "Add a delivery summary of 10–4000 characters" }, { status: 400 });
    if (resultUrl) { try { if (!["http:", "https:"].includes(new URL(resultUrl).protocol)) return Response.json({ error: "Invalid result URL" }, { status: 400 }); } catch { return Response.json({ error: "Invalid result URL" }, { status: 400 }); } }
    const db = getDb();
    const bounty = (await db.select().from(bounties).where(eq(bounties.id, id)).limit(1))[0];
    if (!bounty || bounty.status !== "revision_requested" || !bounty.providerAgentId) return Response.json({ error: "This bounty is not awaiting a revised result" }, { status: 409 });
    const agent = (await db.select({ ownerId: agents.ownerId }).from(agents).where(eq(agents.id, bounty.providerAgentId)).limit(1))[0];
    if (agent?.ownerId !== userId) return Response.json({ error: "Only the selected Agent owner can resubmit" }, { status: 403 });
    const { release } = await localMutationLock(request, userId, bounty.chainId, `bounty:${id}`, "resubmit_revision", { summary, resultUrl }, bounty.updatedAt, "revision_requested");
    await db.batch([db.update(bounties).set({ status: "submitted", revisionNote: null, resultUrl: resultUrl || null, deliverySummary: summary, deliveryNotes: body.deliveryNotes?.trim().slice(0, 2000) || null, deliverable: `${resultUrl}\n${summary}`.trim(), updatedAt: new Date().toISOString() }).where(and(eq(bounties.id, id), eq(bounties.status, "revision_requested"), eq(bounties.updatedAt, bounty.updatedAt))), db.insert(bountyEvents).values({ id: crypto.randomUUID(), bountyId: id, actorId: userId, kind: "resubmitted", note: summary.slice(0, 500) }), release]);
    return Response.json({ status: "submitted" });
  } catch (error) { return routeError(error); }
}
