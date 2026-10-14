import { and, count, desc, eq, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { activePaymentChain } from "@/lib/payment-network";
import { getDb } from "@/db";
import { agents, bounties, policies } from "@/db/schema";
import { optionalUserId, requireUserId, routeError } from "@/lib/auth";

const categories = new Set(["Research", "Content & Marketing", "Data Analysis", "Software Development", "Design", "Social Media", "Web3 Operations", "Other"]);
const availabilities = new Set(["available", "busy", "unavailable"]);
const cleanTags = (values: unknown, limit: number) => Array.isArray(values) ? [...new Set(values.filter((value): value is string => typeof value === "string").map(value => value.trim()).filter(Boolean))].slice(0, limit) : [];

export async function GET(request: Request) {
  try {
    if (new URL(request.url).searchParams.get("scope") === "directory") {
      const ownerId = optionalUserId(request);
      const chainId=activePaymentChain(env);
      const db = getDb();
      const [rows, totals] = await Promise.all([
        db.select({ id: agents.id, name: agents.name, tagline: agents.tagline, about: agents.about, primaryCategory: agents.primaryCategory, skills: agents.skills, tools: agents.tools, workSamples: agents.workSamples, availability: agents.availability, minimumBountyMicros: agents.minimumBountyMicros, typicalDeliveryTime: agents.typicalDeliveryTime, walletProvider: agents.walletProvider, walletAddress: agents.walletAddress, ownerId: agents.ownerId, chainId: agents.chainId }).from(agents).where(and(eq(agents.status, "active"),eq(agents.chainId,chainId))).orderBy(desc(agents.createdAt)).limit(100),
        db.select({ agentId: bounties.providerAgentId, completedJobs: sql<number>`count(*)`, totalEarnedMicros: sql<number>`coalesce(sum(${bounties.rewardMicros}), 0)` }).from(bounties).where(and(eq(bounties.status, "completed"),eq(bounties.chainId,chainId))).groupBy(bounties.providerAgentId),
      ]);
      const stats = new Map(totals.map(row => [row.agentId, row]));
      return Response.json({ agents: rows.map(row => ({ ...row, ownerId: undefined, isMine: Boolean(ownerId && row.ownerId === ownerId), arcReady: row.walletProvider === "circle" && Boolean(row.walletAddress), walletAddress: undefined, walletProvider: row.walletProvider === "circle" && row.walletAddress ? "circle" : "none", completedJobs: Number(stats.get(row.id)?.completedJobs ?? 0), totalEarnedMicros: Number(stats.get(row.id)?.totalEarnedMicros ?? 0) })) }, { headers: { "cache-control": "no-store" } });
    }
    const ownerId = requireUserId(request);
    const rows = await getDb().select({
      id: agents.id,
      name: agents.name,
      purpose: agents.purpose,
      tagline: agents.tagline,
      about: agents.about,
      primaryCategory: agents.primaryCategory,
      skills: agents.skills,
      tools: agents.tools,
      workSamples: agents.workSamples,
      availability: agents.availability,
      minimumBountyMicros: agents.minimumBountyMicros,
      typicalDeliveryTime: agents.typicalDeliveryTime,
      status: agents.status,
      walletProvider: agents.walletProvider,
      walletId: agents.walletId,
      walletAddress: agents.walletAddress,
      chainId: agents.chainId,
      createdAt: agents.createdAt,
      dailyLimitMicros: policies.dailyLimitMicros,
      transactionLimitMicros: policies.transactionLimitMicros,
      spentTodayMicros: policies.spentTodayMicros,
      paused: policies.paused,
    }).from(agents)
      .leftJoin(policies, eq(policies.agentId, agents.id))
      .where(eq(agents.ownerId, ownerId))
      .orderBy(desc(agents.createdAt))
      .limit(50);
    return Response.json({ agents: rows });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const ownerId = requireUserId(request);
    const body = await request.json() as { name?: string; tagline?: string; about?: string; primaryCategory?: string; skills?: unknown; tools?: unknown; workSamples?: unknown; availability?: string; minimumBountyMicros?: number; typicalDeliveryTime?: string };
    const name = body.name?.trim() ?? "";
    const skills = cleanTags(body.skills, 8);
    const tools = cleanTags(body.tools, 12);
    const category = body.primaryCategory ?? "Other";
    const availability = body.availability ?? "available";
    const minimumBountyMicros = body.minimumBountyMicros ?? 0;
    const samples = Array.isArray(body.workSamples) ? body.workSamples.slice(0, 3).flatMap(value => {
      if (!value || typeof value !== "object") return [];
      const sample = value as Record<string, unknown>;
      const title = typeof sample.title === "string" ? sample.title.trim().slice(0, 100) : "";
      const url = typeof sample.url === "string" ? sample.url.trim() : "";
      const description = typeof sample.description === "string" ? sample.description.trim().slice(0, 300) : "";
      try { if (!title || !["http:", "https:"].includes(new URL(url).protocol)) return []; } catch { return []; }
      return [{ title, url, description }];
    }) : [];
    if (!name || name.length > 80 || !body.tagline?.trim() || !body.about?.trim() || !categories.has(category) || !availabilities.has(availability) || skills.length < 1 || skills.length > 8 || !Number.isSafeInteger(minimumBountyMicros) || minimumBountyMicros < 0 || !body.typicalDeliveryTime?.trim()) return Response.json({ error: "Complete the agent profile, including 1–8 skills" }, { status: 400 });
    const agentId = crypto.randomUUID();
    const chainId=activePaymentChain(env);
    const db = getDb();
    const [{ total }] = await db.select({ total: count() }).from(agents).where(eq(agents.ownerId, ownerId));
    if (total >= 20) return Response.json({ error: "This account has reached the Agent profile limit" }, { status: 429 });
    await db.insert(agents).values({ id: agentId, ownerId, chainId, name, purpose: body.tagline.trim(), tagline: body.tagline.trim().slice(0, 160), about: body.about.trim().slice(0, 4000), primaryCategory: category, skills, tools, workSamples: samples, availability: availability as "available" | "busy" | "unavailable", minimumBountyMicros, typicalDeliveryTime: body.typicalDeliveryTime.trim().slice(0, 80), status: "active", walletProvider: "none" });
    return Response.json({ agent: (await db.select().from(agents).where(eq(agents.id, agentId)).limit(1))[0] }, { status: 201 });
  } catch (error) { return routeError(error); }
}
