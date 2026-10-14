import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { contractDeployments } from "@/db/schema";
import { requireUserId, routeError } from "@/lib/auth";
import { assertDeploymentEnabled, deploymentPreflight, deployV2, reconcileV2 } from "@/lib/escrow-deployment";
import { env } from 'cloudflare:workers';
import { activePaymentChain, paymentNetwork } from '@/lib/payment-network';

const KIND = "bounty_escrow";

async function findDeployment(ownerId: string) {
  const chainId=activePaymentChain(env);
  const scope=chainId===5042 ? and(eq(contractDeployments.kind,KIND),eq(contractDeployments.chainId,chainId),eq(contractDeployments.status,'complete'),eq(contractDeployments.contractVersion,2)) : and(eq(contractDeployments.ownerId,ownerId),eq(contractDeployments.kind,KIND),eq(contractDeployments.chainId,chainId));
  return (await getDb().select().from(contractDeployments).where(scope).orderBy(desc(contractDeployments.contractVersion)).limit(1))[0];
}
function responseBody(deployment: Awaited<ReturnType<typeof findDeployment>>) {
  if (!deployment) return { status: "not_deployed", explorerUrl: null };
  const explorer=paymentNetwork(deployment.chainId).explorerUrl;
  const explorerUrl = deployment.contractAddress
    ? `${explorer}/address/${deployment.contractAddress}`
    : deployment.txHash ? `${explorer}/tx/${deployment.txHash}` : null;
  return {
    status: deployment.status,
    chainId: deployment.chainId,
    contractVersion: deployment.contractVersion,
    legacyTimeoutPolicy: deployment.contractVersion < 2,
    contractAddress: deployment.contractAddress,
    txHash: deployment.txHash,
    failureReason: deployment.failureReason,
    explorerUrl,
  };
}

export async function GET(request: Request) {
  try {
    const ownerId = requireUserId(request);
    if (new URL(request.url).searchParams.get("preflight") === "1" && activePaymentChain(env)===5042002) return Response.json(await deploymentPreflight(ownerId), { headers: { "cache-control": "no-store" } });
    return Response.json(responseBody(await findDeployment(ownerId)), { headers: { "cache-control": "no-store" } });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    const owner = requireUserId(request);
    if(activePaymentChain(env)===5042) return Response.json({error:'Mainnet uses the existing reviewed deployment; redeployment is disabled'},{status:423});
    const body = await request.json().catch(() => ({})) as { action?: string };
    if (body.action === "reconcile") return Response.json(await reconcileV2(owner));
    assertDeploymentEnabled(5042002);
    if (body.action !== "deploy_v2") return Response.json({ error: "Explicit reviewed deploy_v2 action required" }, { status: 423 });
    return Response.json(await deployV2(request, owner), { status: 202 });
  }
  catch (error) { return routeError(error); }
}
