import { mutationOrigin } from "./arc-safety";

export function requireUserId(request: Request) {
  const userId = optionalUserId(request);
  if (!userId) throw new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { "content-type": "application/json" } });
  mutationOrigin(request);
  return userId;
}

export function optionalUserId(request: Request) {
  return request.headers.get("oai-authenticated-user-id")?.trim() || null;
}

export function routeError(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json({ error: "The operation could not be completed safely. Please retry or contact the owner." }, { status: 500 });
}
