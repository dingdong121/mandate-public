import "server-only";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { assertWalletCreationEnabled } from "./chain-write-control";
import { paymentNetwork } from "./payment-network";

export type AgentWallet = { id: string; address: string; blockchain: "ARC-TESTNET" | "ARC"; provider: "circle" | "mock" };

export interface WalletProvider {
  readonly mode: "live" | "mock";
  createWallet(label: string): Promise<AgentWallet>;
}

export class MockWalletProvider implements WalletProvider {
  readonly mode = "mock" as const;
  async createWallet(label: string): Promise<AgentWallet> {
    const seed = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${label}:${crypto.randomUUID()}`));
    const address = `0x${Array.from(new Uint8Array(seed)).slice(0, 20).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    return { id: `mock_${crypto.randomUUID()}`, address, blockchain: "ARC-TESTNET", provider: "mock" };
  }
}

export class CircleWalletProvider implements WalletProvider {
  readonly mode = "live" as const;
  constructor(private readonly config: { apiKey: string; entitySecret: string; walletSetId: string; idempotencyKey?: string; chainId?: number }) {}
  async createWallet(_label: string): Promise<AgentWallet> {
    const network=paymentNetwork(this.config.chainId ?? 5042002);
    assertWalletCreationEnabled(network.chainId);
    const client = initiateDeveloperControlledWalletsClient({
      apiKey: this.config.apiKey,
      entitySecret: this.config.entitySecret,
    });
    const response = await client.createWallets({
      idempotencyKey: this.config.idempotencyKey,
      walletSetId: this.config.walletSetId,
      blockchains: [network.blockchain],
      count: 1,
      accountType: "EOA",
    });
    const wallet = response.data?.wallets?.[0];
    if (!wallet?.id || !wallet.address) throw new Error("Circle did not return a wallet ID and address");
    if (wallet.blockchain !== network.blockchain || !/^0x[a-fA-F0-9]{40}$/.test(wallet.address)) throw new Error("Circle returned an unexpected wallet network or address");
    return {
      id: wallet.id,
      address: wallet.address,
      blockchain: network.blockchain,
      provider: "circle",
    };
  }
}

export function walletProvider(config: { apiKey?: string; entitySecret?: string; walletSetId?: string }) {
  return config.apiKey && config.entitySecret && config.walletSetId
    ? new CircleWalletProvider({ apiKey: config.apiKey, entitySecret: config.entitySecret, walletSetId: config.walletSetId })
    : new MockWalletProvider();
}
