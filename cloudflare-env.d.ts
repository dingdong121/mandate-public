declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CIRCLE_API_KEY?: string;
    CIRCLE_ENTITY_SECRET?: string;
    CIRCLE_WALLET_SET_ID?: string;
    CIRCLE_PRIMARY_WALLET_ID?: string;
    CIRCLE_PRIMARY_WALLET_ADDRESS?: string;
    ARC_RPC_URL?: string;
    BOUNTY_ESCROW_ADDRESS?: string;
    CHAIN_WRITES_ENABLED?: string;
    WALLET_CREATION_ENABLED?: string;
    ESCROW_DEPLOYMENT_ENABLED?: string;
    PAYMENT_CHAIN_ID?: string;
    MAINNET_CHAIN_WRITES_ENABLED?: string;
    MAINNET_WALLET_CREATION_ENABLED?: string;
    CIRCLE_MAINNET_API_KEY?: string;
    CIRCLE_MAINNET_ENTITY_SECRET?: string;
    CIRCLE_MAINNET_WALLET_SET_ID?: string;
    ARC_MAINNET_RPC_URL?: string;
    TESTNET_RESPONSE_LOSS_BOUNTY_ID?: string;
  }
}
