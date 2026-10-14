import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, allowedRecipients, ledgerEntries, policies } from "@/db/schema";
import { requireUserId, routeError } from "@/lib/auth";
import { evaluatePayment } from "@/lib/policy-engine";
import { localMutationLock } from "@/lib/local-mutation-lock";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = requireUserId(request);
    const { id } = await context.params;
    const body = await request.json() as { action?: "approve" | "reject"; trustRecipient?: boolean; serviceName?: string };
    if (!body.action || !["approve", "reject"].includes(body.action)) return Response.json({ error: "Choose approve or reject" }, { status: 400 });
    const db = getDb();
    const intent = (await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.id, id), eq(ledgerEntries.ownerId, ownerId), eq(ledgerEntries.kind, "payment_intent"))).limit(1))[0];
    if (!intent) return Response.json({ error: "Payment intent not found" }, { status: 404 });
    if (intent.status !== "review_required") return Response.json({ error: `Intent is already ${intent.status}` }, { status: 409 });
    if (!intent.agentId) return Response.json({ error: "Intent Agent unavailable" }, { status: 409 });
    const owned = (await db.select().from(agents).where(and(eq(agents.id, intent.agentId), eq(agents.ownerId, ownerId))).limit(1))[0];
    if (!owned) return Response.json({ error: "Agent not found" }, { status: 404 });
    const { release } = await localMutationLock(request, ownerId, owned.chainId, `policy:${intent.agentId}`, "review_intent", { id, action: body.action, trustRecipient: Boolean(body.trustRecipient) });
    const latest = (await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, id)).limit(1))[0];
    if (latest?.status !== "review_required") { await release; return Response.json({ error: "Intent was already reviewed" }, { status: 409 }); }
    if (body.action === "reject") {
      await db.batch([db.update(ledgerEntries).set({ status: "rejected", policyDecision: { ...intent.policyDecision, outcome: "rejected", manuallyReviewed: true, reviewedAt: new Date().toISOString() } }).where(and(eq(ledgerEntries.id, id), eq(ledgerEntries.status, "review_required"))), release]);
      return Response.json({ id, status: "rejected" });
    }
    if (!intent.agentId || !intent.recipientAddress) { await release; return Response.json({ error: "Intent is missing its Agent or recipient" }, { status: 409 }); }
    const [agent, policy] = await Promise.all([
      db.select().from(agents).where(and(eq(agents.id, intent.agentId), eq(agents.ownerId, ownerId))).limit(1).then(rows => rows[0]),
      db.select().from(policies).where(eq(policies.agentId, intent.agentId)).limit(1).then(rows => rows[0]),
    ]);
    if (!agent || !policy) { await release; return Response.json({ error: "Agent policy is unavailable" }, { status: 404 }); }
    const dayIndex = Math.floor(Date.now() / 86_400_000);
    const spentTodayMicros = policy.dayIndex === dayIndex ? policy.spentTodayMicros : 0;
    const amountMicros = Math.abs(intent.amountMicros);
    const reevaluated = evaluatePayment({ amountMicros, recipient: intent.recipientAddress, purpose: intent.purpose, idempotencyKey: intent.idempotencyKey }, {
      paused: policy.paused || agent.status !== "active",
      dailyLimitMicros: policy.dailyLimitMicros,
      transactionLimitMicros: policy.transactionLimitMicros,
      spentTodayMicros,
      allowedRecipients: [intent.recipientAddress],
    });
    if (reevaluated.outcome !== "allowed") {
      await db.batch([db.update(ledgerEntries).set({ status: "blocked", policyDecision: { ...reevaluated, manuallyReviewed: true, reviewedAt: new Date().toISOString() } }).where(and(eq(ledgerEntries.id, id), eq(ledgerEntries.status, "review_required"))), release]);
      return Response.json({ id, status: "blocked", decision: reevaluated }, { status: 409 });
    }
    const authorize = db.update(ledgerEntries).set({ status: "authorized", policyDecision: { ...reevaluated, serviceName: body.serviceName?.trim() || "Approved service", manuallyApproved: true, reviewedAt: new Date().toISOString() } }).where(eq(ledgerEntries.id, id));
    const reserveBudget = db.update(policies).set({ spentTodayMicros: spentTodayMicros + amountMicros, dayIndex, updatedAt: new Date().toISOString() }).where(eq(policies.id, policy.id));
    if (body.trustRecipient) {
      const trust = db.insert(allowedRecipients).values({ id: crypto.randomUUID(), agentId: intent.agentId, address: intent.recipientAddress, serviceName: body.serviceName?.trim() || "Approved service", enabled: true }).onConflictDoUpdate({ target: [allowedRecipients.agentId, allowedRecipients.address], set: { serviceName: body.serviceName?.trim() || "Approved service", enabled: true } });
      await db.batch([authorize, reserveBudget, trust, release]);
    } else await db.batch([authorize, reserveBudget, release]);
    return Response.json({ id, status: "authorized", trusted: Boolean(body.trustRecipient) });
  } catch (error) { return routeError(error); }
}
