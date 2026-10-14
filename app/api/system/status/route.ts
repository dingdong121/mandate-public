import { env } from "cloudflare:workers";
import {activePaymentChain,paymentNetwork} from "@/lib/payment-network";

export async function GET() {
  const chainId=activePaymentChain(env),mainnet=chainId===5042;
  const circleReady = mainnet ? Boolean(env.CIRCLE_MAINNET_API_KEY && env.CIRCLE_MAINNET_ENTITY_SECRET && env.CIRCLE_MAINNET_WALLET_SET_ID) : Boolean(env.CIRCLE_API_KEY && env.CIRCLE_ENTITY_SECRET && env.CIRCLE_WALLET_SET_ID);
  const walletProvisioned = mainnet ? Boolean(env.CIRCLE_MAINNET_WALLET_SET_ID) : Boolean(env.CIRCLE_WALLET_SET_ID && env.CIRCLE_PRIMARY_WALLET_ID && env.CIRCLE_PRIMARY_WALLET_ADDRESS);
  return Response.json({
    network: mainnet ? "Arc Mainnet" : "Arc Testnet",
    chainId,
    database: env.DB ? "connected" : "unavailable",
    walletMode: circleReady ? "circle" : mainnet || walletProvisioned ? "awaiting_secrets" : "mock",
    walletProvisioned,
    policyEngine: "ready",
    explorerUrl: paymentNetwork(chainId).explorerUrl,
    chainWritesEnabled: mainnet ? env.MAINNET_CHAIN_WRITES_ENABLED === "mainnet-approved" : env.CHAIN_WRITES_ENABLED === "testnet-approved",
    escrowContract: mainnet ? "verify_network_deployment_registry" : env.BOUNTY_ESCROW_ADDRESS ?? "not_deployed",
  }, { headers: { "cache-control": "no-store" } });
}
