import { count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, applications, bountyEvents, bounties } from "@/db/schema";
import { optionalUserId, requireUserId, routeError } from "@/lib/auth";
import { validExpiry } from "@/lib/arc-safety";
import { env } from "cloudflare:workers";
import { activePaymentChain } from "@/lib/payment-network";

export async function GET(request: Request) {
  try {
    const ownerId = optionalUserId(request);
    const chainId=activePaymentChain(env);
    const db = getDb();
    const ownAgents = ownerId ? await db.select({ id: agents.id }).from(agents).where(eq(agents.ownerId, ownerId)) : [];
    const ownAgentIds = ownAgents.map(agent => agent.id);
    const ownApplications = ownAgentIds.length ? await db.select({ bountyId: applications.bountyId, agentId: applications.agentId, status: applications.status, source: applications.source }).from(applications).where(inArray(applications.agentId, ownAgentIds)) : [];
    const appliedIds = new Set(ownApplications.map(application => application.bountyId));
    const applicationRows = await db.select({ bountyId: applications.bountyId, total: count() }).from(applications).groupBy(applications.bountyId);
    const applicationCounts = new Map(applicationRows.map(row => [row.bountyId, row.total]));
    const rows = await db.select().from(bounties).orderBy(desc(bounties.createdAt)).limit(100);
    return Response.json({ bounties: rows.filter(row => (row.chainId === chainId && (row.status === "open" || row.status === "completed")) || Boolean(ownerId && row.ownerId === ownerId) || Boolean(row.providerAgentId && ownAgentIds.includes(row.providerAgentId)) || appliedIds.has(row.id)).map(row => {
      const isMine = Boolean(ownerId && row.ownerId === ownerId);
      const isSelectedAgent = Boolean(row.providerAgentId && ownAgentIds.includes(row.providerAgentId));
      const isParticipant = isMine || isSelectedAgent || appliedIds.has(row.id);
      const common = { id: row.id, chainId: row.chainId, title: row.title, objective: row.objective, category: row.category, requiredSkills: row.requiredSkills, deliverables: row.deliverables, acceptanceCriteria: row.acceptanceCriteria, rewardMicros: row.rewardMicros, deadline: row.deadline, status: row.status, createdAt: row.createdAt, isMine, isParticipant, hasApplied: appliedIds.has(row.id), myApplications: ownApplications.filter(application => application.bountyId === row.id).map(({ agentId, status, source }) => ({ agentId, status, source })), applicationCount: applicationCounts.get(row.id) ?? 0, providerAgentId: row.providerAgentId };
      return isMine || isSelectedAgent ? { ...row, ...common, ownerId: undefined, refundable: isMine && (row.status === "rejected" || (["funded", "submitted", "revision_requested"].includes(row.status) && new Date(row.deadline).getTime() <= Date.now())) } : common;
    }) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const ownerId = requireUserId(request);
    const body = await request.json() as { title?: string; objective?: string; category?: string; requiredSkills?: string[]; deliverables?: string; criteria?: string[]; rewardMicros?: number; toolBudgetMicros?: number; deadline?: string };
    const skills = Array.isArray(body.requiredSkills) ? [...new Set(body.requiredSkills.filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean))].slice(0, 8) : [];
    if (!body.title?.trim() || !body.objective?.trim() || !body.criteria?.length || !body.deadline || !Number.isSafeInteger(body.rewardMicros) || (body.rewardMicros ?? 0) < 1 || new Date(body.deadline).getTime() <= Date.now()) return Response.json({ error: "Invalid bounty" }, { status: 400 });
    const id = crypto.randomUUID();
    const chainId=activePaymentChain(env);
    validExpiry(body.deadline);
    const db = getDb();
    await db.batch([db.insert(bounties).values({ id, ownerId, chainId, title: body.title.trim().slice(0, 120), objective: body.objective.trim().slice(0, 4000), category: body.category?.trim().slice(0, 80) || "Other", requiredSkills: skills, deliverables: body.deliverables?.trim().slice(0, 2000) || "", acceptanceCriteria: body.criteria.map(value => value.trim()).filter(Boolean).slice(0, 12), rewardMicros: body.rewardMicros!, toolBudgetMicros: Math.max(0, body.toolBudgetMicros ?? 0), deadline: body.deadline, status: "open" }), db.insert(bountyEvents).values({ id: crypto.randomUUID(), bountyId: id, actorId: ownerId, kind: "posted" })]);
    return Response.json({ bounty: (await getDb().select().from(bounties).where(eq(bounties.id, id)).limit(1))[0] }, { status: 201 });
  } catch (error) { return routeError(error); }
}
