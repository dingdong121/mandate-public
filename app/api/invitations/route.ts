import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, applications, bounties, bountyEvents, invitations } from "@/db/schema";
import { requireUserId, routeError } from "@/lib/auth";
import { acceptsApplications } from "@/lib/invitations";
import { localMutationLock } from "@/lib/local-mutation-lock";

function publisherName(request: Request) {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  if (encoded && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { return decodeURIComponent(encoded).trim().slice(0, 120) || "Bounty publisher"; } catch { /* Use email fallback. */ }
  }
  return request.headers.get("oai-authenticated-user-email")?.trim().slice(0, 120) || "Bounty publisher";
}

export async function GET(request: Request) {
  try {
    const userId = requireUserId(request);
    const db = getDb();
    const scope = new URL(request.url).searchParams.get("scope") === "sent" ? "sent" : "received";
    const rows = await db.select({ invitation: invitations, bounty: bounties, agent: agents })
      .from(invitations).innerJoin(bounties, eq(invitations.bountyId, bounties.id))
      .innerJoin(agents, eq(invitations.agentId, agents.id))
      .where(eq(scope === "sent" ? invitations.publisherId : invitations.agentOwnerId, userId))
      .orderBy(desc(invitations.createdAt)).limit(100);
    return Response.json({ invitations: rows.map(({ invitation, bounty, agent }) => ({
      id: invitation.id, bountyId: invitation.bountyId, agentId: invitation.agentId,
      status: invitation.status === "pending" && !acceptsApplications(bounty) ? "expired" : invitation.status, note: invitation.note, publisherName: invitation.publisherName,
      createdAt: invitation.createdAt, agentName: agent.name,
      bountyTitle: bounty.title, bountyAmountMicros: bounty.rewardMicros,
      deadline: bounty.deadline, requiredSkills: bounty.requiredSkills,
    })) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const userId = requireUserId(request);
    const body = await request.json() as { bountyId?: string; agentId?: string; note?: string };
    const note = body.note?.trim() ?? "";
    if (!body.bountyId || !body.agentId || note.length > 500) return Response.json({ error: "Choose an open bounty and Agent; keep the note under 500 characters" }, { status: 400 });
    const db = getDb();
    const [bounty] = await db.select().from(bounties).where(eq(bounties.id, body.bountyId)).limit(1);
    if (!bounty || bounty.ownerId !== userId) return Response.json({ error: "Only the bounty publisher can invite an Agent" }, { status: 403 });
    if (!acceptsApplications(bounty)) return Response.json({ error: "This bounty is no longer accepting invitations" }, { status: 409 });
    const [agent] = await db.select().from(agents).where(eq(agents.id, body.agentId)).limit(1);
    if (!agent || agent.status !== "active" || agent.ownerId === userId) return Response.json({ error: "Choose another user's real, active Agent profile" }, { status: 400 });
    if (agent.chainId !== bounty.chainId) return Response.json({ error: "Agent and bounty must use the same network" }, { status: 409 });
    const [existing] = await db.select({ id: invitations.id }).from(invitations)
      .where(and(eq(invitations.bountyId, bounty.id), eq(invitations.agentId, agent.id))).limit(1);
    if (existing) return Response.json({ error: "This Agent has already been invited to this bounty" }, { status: 409 });
    const [application] = await db.select({ id: applications.id }).from(applications)
      .where(and(eq(applications.bountyId, bounty.id), eq(applications.agentId, agent.id))).limit(1);
    if (application) return Response.json({ error: "This Agent has already applied to this bounty" }, { status: 409 });
    const id = crypto.randomUUID();
    const { release } = await localMutationLock(request, userId, bounty.chainId, `bounty:${bounty.id}`, "invite_agent", { agentId: agent.id, note }, bounty.updatedAt, "open");
    const duplicate = (await db.select({ id: invitations.id }).from(invitations).where(and(eq(invitations.bountyId, bounty.id), eq(invitations.agentId, agent.id))).limit(1))[0];
    const applied = (await db.select({ id: applications.id }).from(applications).where(and(eq(applications.bountyId, bounty.id), eq(applications.agentId, agent.id))).limit(1))[0];
    if (duplicate || applied) {
      await release;
      return Response.json({ error: duplicate ? "This Agent has already been invited to this bounty" : "This Agent has already applied to this bounty" }, { status: 409 });
    }
    await db.batch([
      db.insert(invitations).values({ id, bountyId: bounty.id, agentId: agent.id, publisherId: userId, agentOwnerId: agent.ownerId, publisherName: publisherName(request), note }),
      db.insert(bountyEvents).values({ id: crypto.randomUUID(), bountyId: bounty.id, actorId: userId, kind: "invited", note: agent.name }),
      release,
    ]);
    return Response.json({ invitationId: id }, { status: 201 });
  } catch (error) { return routeError(error); }
}
