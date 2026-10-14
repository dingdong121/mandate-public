import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invitations } from "@/db/schema";
import { requireUserId, routeError } from "@/lib/auth";
import { expirePendingInvitations } from "@/lib/invitations";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = requireUserId(request);
    const { id } = await context.params;
    const body = await request.json() as { action?: "dismiss" | "cancel" };
    if (body.action !== "dismiss" && body.action !== "cancel") return Response.json({ error: "Invalid invitation action" }, { status: 400 });
    const db = getDb();
    await expirePendingInvitations(db);
    const [invitation] = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1);
    if (!invitation || (body.action === "dismiss" ? invitation.agentOwnerId : invitation.publisherId) !== userId) return Response.json({ error: "Invitation not found" }, { status: 404 });
    if (invitation.status !== "pending") return Response.json({ error: "This invitation is no longer pending" }, { status: 409 });
    const status = body.action === "dismiss" ? "dismissed" : "expired";
    await db.update(invitations).set({ status, updatedAt: new Date().toISOString() })
      .where(and(eq(invitations.id, id), eq(invitations.status, "pending")));
    return Response.json({ status });
  } catch (error) { return routeError(error); }
}
