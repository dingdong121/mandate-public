import "server-only";
import { env } from "cloudflare:workers";
import { assertPaymentNetwork, fail, TESTNET } from "./arc-safety";

// Fail closed: only an explicitly approved server-side Testnet setting enables
// sending. Neither request bodies/headers nor browser state can override it.
export function assertChainWritesEnabled(chainId: number) {
  assertPaymentNetwork(chainId);
  if (chainId === TESTNET ? env.CHAIN_WRITES_ENABLED !== "testnet-approved" : env.MAINNET_CHAIN_WRITES_ENABLED !== "mainnet-approved") {
    fail("On-chain operations are paused. Browsing, applications and receipt checks remain available.", 423);
  }
}

// Recheck at the actual send boundary, even when the route already checked.
export function guardedChainWrite<T>(chainId: number, send: () => T): T {
  assertChainWritesEnabled(chainId);
  return send();
}

// Wallet provisioning is an external resource mutation, not a funds transfer.
// Keep its authorization separate from the chain switch.
export function assertWalletCreationEnabled(chainId: number) {
  assertPaymentNetwork(chainId);
  if (chainId === TESTNET ? env.WALLET_CREATION_ENABLED !== "testnet-approved" : env.MAINNET_WALLET_CREATION_ENABLED !== "mainnet-approved") {
    fail("Wallet creation is paused for this network. Your agent profile remains saved.", 423);
  }
}
