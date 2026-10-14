import { env } from "cloudflare:workers";
import { fail, requestKey } from "./arc-safety";

function database() { if (!env.DB) fail("Database unavailable", 503); return env.DB; }
export type Operation = { id: string; transaction_id: string | null; status: string; payload_hash: string; circle_key: string };
export async function claimOperation(request: Request, owner: string, chain: number, resource: string, action: string, payload: unknown) {
  const key = requestKey(request);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ resource, action, payload })));
  const hash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
  const id = crypto.randomUUID(), circleKey = crypto.randomUUID();
  // Atomic unique request + partial unique active-resource indexes provide the
  // durable claim. No expiring lease: an ambiguous send must never be resent.
  const claimed = await database().prepare(`INSERT INTO financial_operations
    (id,owner_id,chain_id,resource,action,request_key,payload_hash,circle_key,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,'claimed',?) ON CONFLICT DO NOTHING RETURNING id`)
    .bind(id, owner, chain, resource, action, key, hash, circleKey, new Date().toISOString()).first<{ id: string }>();
  if (claimed) return { id, circle_key: circleKey, payload_hash: hash, transaction_id: null, status: "claimed", fresh: true };
  const previous = await database().prepare("SELECT * FROM financial_operations WHERE owner_id=? AND chain_id=? AND request_key=?").bind(owner, chain, key).first<Operation>();
  if (!previous) fail("Another operation is active for this resource; reconcile it before continuing");
  if (previous.payload_hash !== hash) fail("Idempotency key was reused with a different action or payload");
  if (!previous.transaction_id) fail("Operation outcome is uncertain; owner reconciliation is required. Do not send again.");
  return { ...previous, fresh: false };
}
export async function uncertainOperation(id: string) {
  await database().prepare("UPDATE financial_operations SET status='uncertain' WHERE id=? AND status='claimed'").bind(id).run();
}
export async function reconcileOperation(transactionId: string) {
  const operation = await database().prepare("SELECT * FROM financial_operations WHERE transaction_id=? AND status='submitted'").bind(transactionId).first<Operation>();
  if (!operation) fail("Legacy or uncertain transaction requires manual reconciliation; no new transaction was sent");
  return operation;
}
