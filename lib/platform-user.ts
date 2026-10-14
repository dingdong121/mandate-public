import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { platformUsers } from "@/db/schema";
import type { ChatGPTUser } from "@/app/chatgpt-auth";

export async function ensurePlatformUser(user: ChatGPTUser) {
  const now = new Date().toISOString();
  await getDb().insert(platformUsers).values({
    id: user.userId,
    email: user.email,
    displayName: user.displayName,
    lastSeenAt: now,
  }).onConflictDoUpdate({
    target: platformUsers.id,
    set: { email: user.email, displayName: user.displayName, lastSeenAt: now },
  });
  return (await getDb().select().from(platformUsers).where(eq(platformUsers.id, user.userId)).limit(1))[0];
}
