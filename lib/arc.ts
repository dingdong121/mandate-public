export const ARC = {
  mainnet: { chainId: 5042, rpcUrl: "https://rpc.mainnet.arc.io", explorerUrl: "https://explorer.arc.io" },
  testnet: { chainId: 5042002, rpcUrl: "https://rpc.testnet.arc.io", explorerUrl: "https://explorer.testnet.arc.io" },
} as const;

export type ArcNetwork = keyof typeof ARC;

export function explorerTx(network: ArcNetwork, txHash: string) {
  return `${ARC[network].explorerUrl}/tx/${txHash}`;
}
