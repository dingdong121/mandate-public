import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { financialOperations, bounties } from "@/db/schema";
import { claimOperation } from "./financial-operations";
import { fail } from "./arc-safety";

// Same durable resource lock as financial submission, for related local edits.
// On any ambiguous database outcome keep the claim for owner review.
export async function localMutationLock(request: Request, owner: string, chain: number, resource: string, action: string, payload: unknown, expectedAt?: string, expectedStatus?: string) {
  const operation = await claimOperation(request, owner, chain, resource, action, payload);
  if (!operation.fresh) fail("This local edit was already completed");
  if (expectedAt && resource.startsWith("bounty:")) {
    const current = (await getDb().select().from(bounties).where(eq(bounties.id, resource.slice(7))).limit(1))[0];
    if (!current || current.updatedAt !== expectedAt || expectedStatus && current.status !== expectedStatus || current.currentTransactionId || current.settlementTransactionId) {
      await getDb().update(financialOperations).set({ status: "failed" }).where(eq(financialOperations.id, operation.id));
      fail("Bounty changed; reload before editing");
    }
  }
  // Wrap the thenable query so the async return does not execute it early.
  return { release: getDb().update(financialOperations).set({ status: "complete", transactionId: `local:${operation.id}` }).where(eq(financialOperations.id, operation.id)) };
}
