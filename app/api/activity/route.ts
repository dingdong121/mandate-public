import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agents, bounties, ledgerEntries } from "@/db/schema";
import { requireUserId, routeError } from "@/lib/auth";

type Activity = {
  id: string;
  kind: string;
  title: string;
  note: string;
  amountMicros: number;
  direction: "in" | "out" | "none";
  status: "settled" | "pending" | "blocked" | "authorized" | "review" | "rejected";
  txHash: string | null;
  createdAt: string;
};

export async function GET(request: Request) {
  try {
    const ownerId = requireUserId(request);
    const db = getDb();
    const [bountyRows, agentRows, ledgerRows] = await Promise.all([
      db.select().from(bounties).where(eq(bounties.ownerId, ownerId)).orderBy(desc(bounties.createdAt)).limit(50),
      db.select().from(agents).where(eq(agents.ownerId, ownerId)).limit(100),
      db.select().from(ledgerEntries).where(eq(ledgerEntries.ownerId, ownerId)).orderBy(desc(ledgerEntries.createdAt)).limit(100),
    ]);
    const agentNames = new Map(agentRows.map(agent => [agent.id, agent.name]));
    const activities: Activity[] = [];

    for (const bounty of bountyRows) {
      const job = bounty.onchainJobId ? `Arc Job #${bounty.onchainJobId}` : "Bounty draft";
      if (bounty.fundTxHash) activities.push({ id: `${bounty.id}:fund`, kind: "escrow_funded", title: "Reward locked in escrow", note: `${job} · ${bounty.title}`, amountMicros: bounty.rewardMicros, direction: "out", status: "settled", txHash: bounty.fundTxHash, createdAt: bounty.createdAt });
      if (bounty.submitTxHash) activities.push({ id: `${bounty.id}:submit`, kind: "result_submitted", title: "Agent result submitted", note: `${job} · ${agentNames.get(bounty.providerAgentId ?? "") ?? "Agent"}`, amountMicros: 0, direction: "none", status: "settled", txHash: bounty.submitTxHash, createdAt: bounty.updatedAt });
      if (bounty.completeTxHash) activities.push({ id: `${bounty.id}:complete`, kind: "agent_paid", title: "Agent payout completed", note: `${job} · ${agentNames.get(bounty.providerAgentId ?? "") ?? "Agent"}`, amountMicros: bounty.rewardMicros, direction: "in", status: "settled", txHash: bounty.completeTxHash, createdAt: bounty.updatedAt });
      if (bounty.rejectTxHash) activities.push({ id: `${bounty.id}:reject`, kind: "result_rejected", title: "Result rejected", note: `${job} · refund follows`, amountMicros: 0, direction: "none", status: bounty.refundTxHash ? "settled" : "pending", txHash: bounty.rejectTxHash, createdAt: bounty.updatedAt });
      if (bounty.refundTxHash) activities.push({ id: `${bounty.id}:refund`, kind: "escrow_refunded", title: "Escrow refunded", note: `${job} · returned to treasury`, amountMicros: bounty.rewardMicros, direction: "in", status: "settled", txHash: bounty.refundTxHash, createdAt: bounty.updatedAt });
    }
    for (const entry of ledgerRows) {
      const status: Activity["status"] = entry.status === "blocked" ? "blocked" : entry.status === "authorized" ? "authorized" : entry.status === "review_required" ? "review" : entry.status === "rejected" ? "rejected" : entry.status === "settled" ? "settled" : "pending";
      const decision = entry.policyDecision as { serviceName?: string };
      activities.push({ id: entry.id, kind: entry.kind, title: entry.purpose, note: decision.serviceName ? `${decision.serviceName} · ${entry.recipientAddress ?? "Policy engine"}` : entry.recipientAddress ?? "Policy engine", amountMicros: Math.abs(entry.amountMicros), direction: entry.amountMicros < 0 ? "out" : entry.amountMicros > 0 ? "in" : "none", status, txHash: entry.txHash, createdAt: entry.createdAt });
    }
    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const completedMicros = bountyRows.filter(bounty => bounty.status === "completed").reduce((sum, bounty) => sum + bounty.rewardMicros, 0);
    return Response.json({
      activities: activities.slice(0, 100),
      metrics: {
        completedMicros,
        activeBounties: bountyRows.filter(bounty => ["funded", "running", "submitted"].includes(bounty.status)).length,
        completedBounties: bountyRows.filter(bounty => bounty.status === "completed").length,
        policyBlocks: ledgerRows.filter(entry => entry.status === "blocked").length,
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return routeError(error); }
}
