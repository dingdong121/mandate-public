import { evaluatePayment, type PaymentIntent, type SpendingPolicy } from "@/lib/policy-engine";
import { requireUserId, routeError } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    requireUserId(request);
    const body = await request.json() as { intent?: PaymentIntent; policy?: SpendingPolicy };
    if (!body.intent || !body.policy) return Response.json({ error: "intent and policy are required" }, { status: 400 });
    return Response.json({ decision: evaluatePayment(body.intent, body.policy) });
  } catch (error) { return routeError(error); }
}
