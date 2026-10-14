import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, allowedRecipients, ledgerEntries, policies } from "@/db/schema";
import { requireUserId, routeError } from "@/lib/auth";
import { evaluatePayment } from "@/lib/policy-engine";
import { localMutationLock } from "@/lib/local-mutation-lock";
import { requestKey } from "@/lib/arc-safety";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

async function listIntents(ownerId: string) {
  const db = getDb();
  const rows = await db.select({
    id: ledgerEntries.id,
    agentId: ledgerEntries.agentId,
    agentName: agents.name,
    amountMicros: ledgerEntries.amountMicros,
    recipientAddress: ledgerEntries.recipientAddress,
    purpose: ledgerEntries.purpose,
    policyDecision: ledgerEntries.policyDecision,
    status: ledgerEntries.status,
    idempotencyKey: ledgerEntries.idempotencyKey,
    txHash: ledgerEntries.txHash,
    createdAt: ledgerEntries.createdAt,
  }).from(ledgerEntries)
    .leftJoin(agents, eq(agents.id, ledgerEntries.agentId))
    .where(and(eq(ledgerEntries.ownerId, ownerId), eq(ledgerEntries.kind, "payment_intent")))
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(100);
  return rows;
}

export async function GET(request: Request) {
  try {
    const ownerId = requireUserId(request);
    return Response.json({ intents: await listIntents(ownerId) }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const ownerId = requireUserId(request);
    const body = await request.json() as { agentId?: string; recipient?: string; serviceName?: string; amountMicros?: number; purpose?: string; idempotencyKey?: string };
    const agentId = body.agentId?.trim() ?? "";
    const recipient = body.recipient?.trim().toLowerCase() ?? "";
    const purpose = body.purpose?.trim() ?? "";
    const serviceName = body.serviceName?.trim() || "External service";
    const amountMicros = body.amountMicros ?? 0;
    const idempotencyKey = body.idempotencyKey?.trim() || requestKey(request);
    if (!agentId || !ADDRESS.test(recipient) || !Number.isSafeInteger(amountMicros) || amountMicros < 1) return Response.json({ error: "Choose an Agent and enter a valid amount and Arc address" }, { status: 400 });

    const db = getDb();
    const existing = (await db.select().from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, idempotencyKey)).limit(1))[0];
    if (existing) {
      if (existing.ownerId !== ownerId) return Response.json({ error: "Intent key is already in use" }, { status: 409 });
      if (existing.agentId !== agentId || existing.recipientAddress !== recipient || Math.abs(existing.amountMicros) !== amountMicros || existing.purpose !== purpose) return Response.json({ error: "Intent key was reused with a different payload" }, { status: 409 });
      return Response.json({ intent: existing, replayed: true });
    }

    const agent = (await db.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.ownerId, ownerId))).limit(1))[0];
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
    const { release } = await localMutationLock(request, ownerId, agent.chainId, `policy:${agentId}`, "create_intent", { recipient, amountMicros, purpose, idempotencyKey });
    const policy = (await db.select().from(policies).where(eq(policies.agentId, agentId)).limit(1))[0];
    if (!policy) { await release; return Response.json({ error: "Agent policy not found" }, { status: 404 }); }

    const dayIndex = Math.floor(Date.now() / 86_400_000);
    const spentTodayMicros = policy.dayIndex === dayIndex ? policy.spentTodayMicros : 0;
    const recipients = await db.select().from(allowedRecipients).where(and(eq(allowedRecipients.agentId, agentId), eq(allowedRecipients.enabled, true)));
    const decision = evaluatePayment({ amountMicros, recipient, purpose, idempotencyKey }, {
      paused: policy.paused || agent.status !== "active",
      dailyLimitMicros: policy.dailyLimitMicros,
      transactionLimitMicros: policy.transactionLimitMicros,
      spentTodayMicros,
      allowedRecipients: recipients.map(row => row.address),
    });
    const id = crypto.randomUUID();
    const status = decision.outcome === "allowed" ? "authorized" : decision.outcome;
    const decisionRecord = { ...decision, serviceName, policyVersion: policy.version, evaluatedAt: new Date().toISOString() };
    const insertIntent = db.insert(ledgerEntries).values({ id, ownerId, agentId, kind: "payment_intent", amountMicros: -amountMicros, recipientAddress: recipient, purpose, policyDecision: decisionRecord, status, idempotencyKey });
    if (status === "authorized") {
      await db.batch([
        insertIntent,
        db.update(policies).set({ spentTodayMicros: spentTodayMicros + amountMicros, dayIndex, updatedAt: new Date().toISOString() }).where(eq(policies.id, policy.id)),
        release,
      ]);
    } else await db.batch([insertIntent, release]);
    const intent = (await listIntents(ownerId)).find(row => row.id === id);
    return Response.json({ intent, decision }, { status: 201 });
  } catch (error) { return routeError(error); }
}
