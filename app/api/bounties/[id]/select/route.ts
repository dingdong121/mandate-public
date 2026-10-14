import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, applications, bountyEvents, bounties, invitations } from "@/db/schema";
import { requireUserId, routeError } from "@/lib/auth";
import { acceptsApplications } from "@/lib/invitations";
import { localMutationLock } from "@/lib/local-mutation-lock";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = requireUserId(request);
    const { id } = await context.params;
    const body = await request.json() as { agentId?: string };
    if (!body.agentId) return Response.json({ error: "Select an Agent Account" }, { status: 400 });

    const db = getDb();
    const bounty = (await db.select().from(bounties).where(eq(bounties.id, id)).limit(1))[0];
    if (!bounty) return Response.json({ error: "Bounty not found" }, { status: 404 });
    if (bounty.ownerId !== ownerId) return Response.json({ error: "Only the bounty publisher can select an Agent" }, { status: 403 });
    if (!acceptsApplications(bounty)) return Response.json({ error: "This bounty is not open for selection" }, { status: 409 });

    const application = (await db.select().from(applications).where(and(eq(applications.bountyId, id), eq(applications.agentId, body.agentId), eq(applications.status, "applied"))).limit(1))[0];
    if (!application) return Response.json({ error: "Select an Agent that applied to this bounty" }, { status: 400 });
    const agent = (await db.select().from(agents).where(eq(agents.id, body.agentId)).limit(1))[0];
    if (!agent?.walletAddress || agent.walletProvider !== "circle" || agent.status !== "active") return Response.json({ error: "Select an active Agent Profile with a connected Circle wallet" }, { status: 400 });
    if (agent.chainId !== bounty.chainId) return Response.json({ error: "Agent and bounty must use the same network" }, { status: 409 });

    const now = new Date().toISOString();
    const { release } = await localMutationLock(request, ownerId, bounty.chainId, `bounty:${id}`, "select_agent", { agentId: agent.id }, bounty.updatedAt, "open");
    await db.batch([
      db.update(bounties).set({ providerAgentId: agent.id, status: "draft", updatedAt: now }).where(and(eq(bounties.id, id), eq(bounties.ownerId, ownerId), eq(bounties.status, "open"))),
      db.update(applications).set({ status: "not_selected", updatedAt: now }).where(eq(applications.bountyId, id)),
      db.update(applications).set({ status: "selected", updatedAt: now }).where(eq(applications.id, application.id)),
      db.update(invitations).set({ status: "expired", updatedAt: now }).where(and(eq(invitations.bountyId, id), eq(invitations.status, "pending"))),
      db.insert(bountyEvents).values({ id: crypto.randomUUID(), bountyId: id, actorId: ownerId, kind: "selected", note: agent.name }),
      release,
    ]);
    return Response.json({ bounty: (await db.select().from(bounties).where(eq(bounties.id, id)).limit(1))[0] });
  } catch (error) { return routeError(error); }
}
