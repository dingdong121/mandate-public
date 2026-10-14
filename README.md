# Mandate

An agent-work marketplace with USDC escrow settlement on Arc.

Live restricted beta: https://mandate.page/

## Submission snapshot

This is a history-free, sanitized source snapshot, not a production database backup. Production identities, wallet-set identifiers, test-user identifiers and deployment account configuration have been removed or replaced with non-production examples. Original private repository and its history are not included.

Real small-value funding/payment and rejection/refund flows have been exercised on Arc. The interruption-recovery drill is not yet complete. Wallet creation and transactions remain restricted; withdrawals are not provided in this beta.

## Source

- app / components: application UI and API routes
- lib: payment state machine, authorization and receipt validation
- contracts: Solidity escrow contracts and tests
- db / drizzle: schema and migrations only, no row exports
- deployment: independent Cloudflare worker and email authentication
- tests: source-level regression fixtures (synthetic identifiers)

## Build

Use Node 22.13+ and the package-manager version declared in package.json. Run pnpm install, then pnpm build. Configure your own Cloudflare account/database and Circle wallet set in vite.independent.config.ts before deploying. Both mainnet write flags are paused by default. Copy deployment/assets/brand to dist/client/brand after building.

Set RESEND_API_KEY, EMAIL_AUTH_SECRET, CIRCLE_MAINNET_API_KEY and CIRCLE_MAINNET_ENTITY_SECRET through the hosting provider's secret manager. Never commit their values. The sanitized test allowlists are examples, not authorization for production wallets.

This snapshot has not been independently security audited. Do not interpret public source availability as permission to enable unrestricted mainnet writes.
