import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contractDeployments } from "@/db/schema";
import { assertTestnet, TESTNET } from "./arc-safety";

export async function requireTreasuryOperator(userId: string, chainId = TESTNET) {
  assertTestnet(chainId);
  const existing = (await getDb().select({ id: contractDeployments.id }).from(contractDeployments)
    .where(and(eq(contractDeployments.ownerId, userId), eq(contractDeployments.kind, "bounty_escrow"), eq(contractDeployments.chainId, chainId), eq(contractDeployments.status, "complete"))).limit(1))[0];
  if (!existing) throw new Response(JSON.stringify({ error: "Treasury and Arc funding operations are not enabled for this account" }), { status: 403, headers: { "content-type": "application/json" } });
}
