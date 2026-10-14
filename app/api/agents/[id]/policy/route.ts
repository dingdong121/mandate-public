import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, policies } from "@/db/schema";
import { requireUserId, routeError } from "@/lib/auth";
import { localMutationLock } from "@/lib/local-mutation-lock";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = requireUserId(request);
    const { id } = await context.params;
    const body = await request.json() as { paused?: boolean; dailyLimitMicros?: number; transactionLimitMicros?: number };
    const db = getDb();
    const agent = (await db.select().from(agents).where(and(eq(agents.id, id), eq(agents.ownerId, ownerId))).limit(1))[0];
    if (!agent) return Response.json({ error: "Agent not found" }, { status: 404 });
    const { release } = await localMutationLock(request, ownerId, agent.chainId, `policy:${id}`, "update_policy", body);
    const policy = (await db.select().from(policies).where(eq(policies.agentId, id)).limit(1))[0];
    if (!policy) { await release; return Response.json({ error: "Agent policy not found" }, { status: 404 }); }
    const dailyLimitMicros = body.dailyLimitMicros ?? policy.dailyLimitMicros;
    const transactionLimitMicros = body.transactionLimitMicros ?? policy.transactionLimitMicros;
    if (body.paused !== undefined && typeof body.paused !== "boolean" || !Number.isSafeInteger(dailyLimitMicros) || !Number.isSafeInteger(transactionLimitMicros) || dailyLimitMicros < 1 || transactionLimitMicros < 1 || transactionLimitMicros > dailyLimitMicros) { await release; return Response.json({ error: "Invalid wallet controls" }, { status: 400 }); }
    const paused = body.paused ?? policy.paused;
    await db.batch([db.update(policies).set({ paused, dailyLimitMicros, transactionLimitMicros, version: policy.version + 1, updatedAt: new Date().toISOString() }).where(eq(policies.id, policy.id)), release]);
    return Response.json({ agentId: id, paused, dailyLimitMicros, transactionLimitMicros, version: policy.version + 1 });
  } catch (error) { return routeError(error); }
}
