import { and, count, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, applications, bounties, invitations } from "@/db/schema";
import { requireUserId, routeError } from "@/lib/auth";
import { acceptsApplications } from "@/lib/invitations";

type DashboardAction = {
  key: string;
  kind: "invitation" | "review-applications" | "fund" | "submit" | "review-result" | "resubmit" | "refund";
  title: string;
  bountyId: string;
  bountyTitle: string;
  agentId?: string;
  agentName?: string;
  status: string;
  deadline?: string;
  count?: number;
  actionLabel: string;
};

export async function GET(request: Request) {
  try {
    const userId = requireUserId(request);
    const db = getDb();

    const ownAgents = await db.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.ownerId, userId));
    const ownAgentIds = ownAgents.map(agent => agent.id);
    const agentNames = new Map(ownAgents.map(agent => [agent.id, agent.name]));
    const [received, published, applicationTotals, selectedWork] = await Promise.all([
      db.select({ invitation: invitations, bounty: bounties, agent: agents })
        .from(invitations)
        .innerJoin(bounties, eq(invitations.bountyId, bounties.id))
        .innerJoin(agents, eq(invitations.agentId, agents.id))
        .where(and(eq(invitations.agentOwnerId, userId), eq(invitations.status, "pending"))),
      db.select().from(bounties).where(eq(bounties.ownerId, userId)),
      db.select({ bountyId: applications.bountyId, total: count() }).from(applications).groupBy(applications.bountyId),
      ownAgentIds.length ? db.select().from(bounties).where(inArray(bounties.providerAgentId, ownAgentIds)) : Promise.resolve([]),
    ]);

    const counts = new Map(applicationTotals.map(row => [row.bountyId, Number(row.total)]));
    const now = Date.now();
    const actions: DashboardAction[] = received.filter(row => acceptsApplications(row.bounty)).map(({ invitation, bounty, agent }) => ({
      key: `invitation:${invitation.id}`,
      kind: "invitation",
      title: "New bounty invitation",
      bountyId: bounty.id,
      bountyTitle: bounty.title,
      agentId: agent.id,
      agentName: agent.name,
      status: "Pending",
      deadline: bounty.deadline,
      actionLabel: "View & apply",
    }));

    for (const bounty of published) {
      const applicationCount = counts.get(bounty.id) ?? 0;
      if (bounty.status === "open" && !bounty.providerAgentId && applicationCount > 0 && new Date(bounty.deadline).getTime() > now) {
        actions.push({ key: `review-applications:${bounty.id}`, kind: "review-applications", title: `${applicationCount} application${applicationCount === 1 ? "" : "s"} to review`, bountyId: bounty.id, bountyTitle: bounty.title, status: "Awaiting selection", deadline: bounty.deadline, count: applicationCount, actionLabel: "Review applications" });
      } else if (bounty.status === "draft" && bounty.providerAgentId) {
        actions.push({ key: `fund:${bounty.id}`, kind: "fund", title: "Agent selected, funding required", bountyId: bounty.id, bountyTitle: bounty.title, agentId: bounty.providerAgentId, status: "Awaiting funding", deadline: bounty.deadline, actionLabel: "Fund on Arc" });
      } else if (bounty.status === "submitted") {
        actions.push({ key: `review-result:${bounty.id}`, kind: "review-result", title: "Result submitted", bountyId: bounty.id, bountyTitle: bounty.title, agentId: bounty.providerAgentId ?? undefined, status: "Awaiting review", deadline: bounty.deadline, actionLabel: "Review result" });
      } else if (bounty.status === "rejected" || (["funded", "revision_requested"].includes(bounty.status) && new Date(bounty.deadline).getTime() <= now)) {
        actions.push({ key: `refund:${bounty.id}`, kind: "refund", title: "Refund action required", bountyId: bounty.id, bountyTitle: bounty.title, agentId: bounty.providerAgentId ?? undefined, status: "Refund available", deadline: bounty.deadline, actionLabel: "Review refund" });
      }
    }

    for (const bounty of selectedWork) {
      const agentName = bounty.providerAgentId ? agentNames.get(bounty.providerAgentId) : undefined;
      if (["funded", "running"].includes(bounty.status)) {
        actions.push({ key: `submit:${bounty.id}`, kind: "submit", title: "Work ready to start", bountyId: bounty.id, bountyTitle: bounty.title, agentId: bounty.providerAgentId ?? undefined, agentName, status: "Result required", deadline: bounty.deadline, actionLabel: "Open task" });
      } else if (bounty.status === "revision_requested") {
        actions.push({ key: `resubmit:${bounty.id}`, kind: "resubmit", title: "Revision requested", bountyId: bounty.id, bountyTitle: bounty.title, agentId: bounty.providerAgentId ?? undefined, agentName, status: "Revised result required", deadline: bounty.deadline, actionLabel: "Resubmit" });
      }
    }

    return Response.json({ actions }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return routeError(error); }
}
