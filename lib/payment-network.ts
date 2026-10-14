import { ARC } from './arc';

// Network resolution is separate from authorization to send. Introducing this
// module does NOT enable Mainnet in the existing Testnet-only routes.
export type PaymentEnvironment = {
  PAYMENT_CHAIN_ID?: string;
  CIRCLE_API_KEY?: string; CIRCLE_ENTITY_SECRET?: string; CIRCLE_WALLET_SET_ID?: string; ARC_RPC_URL?: string;
  CIRCLE_MAINNET_API_KEY?: string; CIRCLE_MAINNET_ENTITY_SECRET?: string; CIRCLE_MAINNET_WALLET_SET_ID?: string; ARC_MAINNET_RPC_URL?: string;
};
export function activePaymentChain(env: PaymentEnvironment) {
  const chain=env.PAYMENT_CHAIN_ID === undefined ? ARC.testnet.chainId : Number(env.PAYMENT_CHAIN_ID);
  return paymentNetwork(chain).chainId;
}
export function paymentNetwork(chainId: number) {
  if (chainId === ARC.testnet.chainId) return { ...ARC.testnet, name: 'testnet' as const, blockchain: 'ARC-TESTNET' as const };
  if (chainId === ARC.mainnet.chainId) return { ...ARC.mainnet, name: 'mainnet' as const, blockchain: 'ARC' as const };
  throw new Error('Unsupported payment network');
}
export function paymentCredentials(chainId: number, env: PaymentEnvironment, provisioning = false) {
  const network=paymentNetwork(chainId);
  const mainnet=network.name==='mainnet';
  const apiKey=mainnet?env.CIRCLE_MAINNET_API_KEY:env.CIRCLE_API_KEY;
  const entitySecret=mainnet?env.CIRCLE_MAINNET_ENTITY_SECRET:env.CIRCLE_ENTITY_SECRET;
  const walletSetId=mainnet?env.CIRCLE_MAINNET_WALLET_SET_ID:env.CIRCLE_WALLET_SET_ID;
  // Never fall back between networks, even if only the other network is set.
  if(!apiKey||!entitySecret||(provisioning&&!walletSetId))throw new Error('Payment credentials unavailable for the selected network');
  return {apiKey,entitySecret,walletSetId,blockchain:network.blockchain,chainId:network.chainId,rpcUrl:(mainnet?env.ARC_MAINNET_RPC_URL:env.ARC_RPC_URL)||network.rpcUrl};
}
