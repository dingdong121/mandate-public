import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, applications, bountyEvents, bounties, invitations } from "@/db/schema";
import { requireUserId, routeError } from "@/lib/auth";
import { acceptsApplications } from "@/lib/invitations";
import { localMutationLock } from "@/lib/local-mutation-lock";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = requireUserId(request);
    const { id } = await context.params;
    const db = getDb();
    const bounty = (await db.select().from(bounties).where(eq(bounties.id, id)).limit(1))[0];
    if (!bounty) return Response.json({ error: "Bounty not found" }, { status: 404 });
    const rows = await db.select({ application: applications, agent: agents }).from(applications).innerJoin(agents, eq(applications.agentId, agents.id)).where(eq(applications.bountyId, id)).orderBy(desc(applications.createdAt)).limit(50);
    const visible = rows
      .filter(row => bounty.ownerId === userId || row.application.ownerId === userId)
      .sort((left, right) => {
        const leftSelected = left.application.agentId === bounty.providerAgentId;
        const rightSelected = right.application.agentId === bounty.providerAgentId;
        if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;
        return right.application.createdAt.localeCompare(left.application.createdAt);
      });
    if (bounty.ownerId !== userId && !visible.length) return Response.json({ error: "Applications are private to the client and applicants" }, { status: 403 });
    const totals = await db.select({ agentId: bounties.providerAgentId, completedJobs: sql<number>`count(*)`, totalEarnedMicros: sql<number>`coalesce(sum(${bounties.rewardMicros}), 0)` })
      .from(bounties).where(eq(bounties.status, "completed")).groupBy(bounties.providerAgentId);
    const stats = new Map(totals.map(row => [row.agentId, row]));
    return Response.json({ applications: visible.map(({ application, agent }) => ({ ...application, ownerId: undefined, isSelected: application.agentId === bounty.providerAgentId, agent: { id: agent.id, name: agent.name, tagline: agent.tagline, about: agent.about, primaryCategory: agent.primaryCategory, skills: agent.skills, tools: agent.tools, workSamples: agent.workSamples, minimumBountyMicros: agent.minimumBountyMicros, circleAccountStatus: agent.walletProvider === "circle" && agent.walletAddress ? "Connected account" : "Not connected", arcReady: agent.walletProvider === "circle" && Boolean(agent.walletAddress), completedJobs: Number(stats.get(agent.id)?.completedJobs ?? 0), totalEarnedMicros: Number(stats.get(agent.id)?.totalEarnedMicros ?? 0) } })) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = requireUserId(request);
    const { id } = await context.params;
    const body = await request.json() as { agentId?: string; proposal?: string; expectedDeliveryTime?: string; proposedAmountMicros?: number; workSampleUrl?: string };
    const db = getDb();
    const bounty = (await db.select().from(bounties).where(eq(bounties.id, id)).limit(1))[0];
    if (!bounty || !acceptsApplications(bounty)) return Response.json({ error: "This bounty is not accepting applications" }, { status: 409 });
    if (bounty.ownerId === userId) return Response.json({ error: "You cannot apply to your own bounty" }, { status: 403 });
    const agent = body.agentId ? (await db.select().from(agents).where(and(eq(agents.id, body.agentId), eq(agents.ownerId, userId))).limit(1))[0] : null;
    if (!agent || agent.status !== "active") return Response.json({ error: "Choose one of your active Agent profiles" }, { status: 400 });
    if (agent.chainId !== bounty.chainId) return Response.json({ error: "Agent and bounty must use the same network" }, { status: 409 });
    if (agent.walletProvider !== "circle" || !agent.walletAddress) return Response.json({ error: "Connect a Circle Agent Account before applying" }, { status: 409 });
    const proposal = body.proposal?.trim() ?? "";
    const expectedDeliveryTime = body.expectedDeliveryTime?.trim() ?? "";
    const amount = body.proposedAmountMicros ?? bounty.rewardMicros;
    let workSampleUrl = body.workSampleUrl?.trim() || null;
    if (workSampleUrl) { try { if (!["http:", "https:"].includes(new URL(workSampleUrl).protocol)) workSampleUrl = null; } catch { workSampleUrl = null; } }
    if (proposal.length < 10 || proposal.length > 2000 || !expectedDeliveryTime || expectedDeliveryTime.length > 80 || !Number.isSafeInteger(amount) || amount !== bounty.rewardMicros || (body.workSampleUrl?.trim() && !workSampleUrl)) return Response.json({ error: "Add a proposal and delivery time; the first version uses the posted bounty amount" }, { status: 400 });
    const existing = (await db.select({ id: applications.id }).from(applications).where(and(eq(applications.bountyId, id), eq(applications.agentId, agent.id))).limit(1))[0];
    if (existing) return Response.json({ error: "This Agent has already applied" }, { status: 409 });
    const invitation = (await db.select().from(invitations).where(and(eq(invitations.bountyId, id), eq(invitations.agentId, agent.id), eq(invitations.status, "pending"))).limit(1))[0];
    const applicationId = crypto.randomUUID();
    const { release } = await localMutationLock(request, userId, bounty.chainId, `bounty:${id}`, "apply_agent", { agentId: agent.id, proposal, expectedDeliveryTime, amount, workSampleUrl }, bounty.updatedAt, "open");
    // Recheck inside the shared lock: another request may have completed while
    // the initial eligibility queries were running.
    const duplicate = (await db.select({ id: applications.id }).from(applications).where(and(eq(applications.bountyId, id), eq(applications.agentId, agent.id))).limit(1))[0];
    if (duplicate) {
      await release;
      return Response.json({ error: "This Agent has already applied" }, { status: 409 });
    }
    await db.batch([
      db.insert(applications).values({ id: applicationId, bountyId: id, agentId: agent.id, ownerId: userId, proposal, expectedDeliveryTime, proposedAmountMicros: amount, workSampleUrl, source: invitation ? "invited" : "organic" }),
      ...(invitation ? [db.update(invitations).set({ status: "applied" as const, updatedAt: new Date().toISOString() }).where(eq(invitations.id, invitation.id))] : []),
      db.insert(bountyEvents).values({ id: crypto.randomUUID(), bountyId: id, actorId: userId, kind: "applied", note: agent.name }),
      release,
    ]);
    return Response.json({ applicationId, source: invitation ? "invited" : "organic" }, { status: 201 });
  } catch (error) { return routeError(error); }
}
