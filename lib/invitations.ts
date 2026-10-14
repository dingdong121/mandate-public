import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { bounties, invitations } from "@/db/schema";

type BountyWindow = Pick<typeof bounties.$inferSelect, "status" | "providerAgentId" | "deadline">;

export function acceptsApplications(bounty: BountyWindow) {
  return bounty.status === "open" && !bounty.providerAgentId && new Date(bounty.deadline).getTime() > Date.now();
}

// Invitations expire lazily when their owner or publisher next reads them. Selection
// also expires outstanding invitations immediately in the selection transaction.
export async function expirePendingInvitations(db: ReturnType<typeof getDb>) {
  const pending = await db.select({ id: invitations.id, bounty: bounties }).from(invitations)
    .innerJoin(bounties, eq(invitations.bountyId, bounties.id))
    .where(eq(invitations.status, "pending"));
  const expiredIds = pending.filter(row => !acceptsApplications(row.bounty)).map(row => row.id);
  if (expiredIds.length) await db.update(invitations).set({ status: "expired", updatedAt: new Date().toISOString() })
    .where(and(inArray(invitations.id, expiredIds), eq(invitations.status, "pending")));
}
