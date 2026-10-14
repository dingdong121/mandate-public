# Mainnet Beta validation

Live app: https://mandate.page/

- Real small-value payment and reject/refund flow verified.
- Controlled response loss after Circle acceptance recovered the original transaction without creating a replacement payment. This was not a process-crash test.
- A new publisher outside the original test allowlist completed a 0.01 USDC task with an existing provider. Receipt status succeeded and application state matched.
- Wallet ownership and one-wallet-per-account limit checked for the new account. Global daily cap verified locally, not by creating 21 live wallets.

Payment evidence:
https://explorer.arc.io/tx/0x3e5454a9ba17041cd085dcfb2af7bde6bf1c9d68ff9ac2eb48e9b3d88989ac1a

Recovery evidence:
https://explorer.arc.io/tx/0x4fcfeef310bf43ff87d8d25cd89096d4e3ff555e58dfaf1a06b28a1a9bc227ea

Limits: 0.10 USDC reward/task, Gas additional, maximum 0.20 USDC reserved Gas/task, one wallet/account, 20 new reservations/UTC day. Withdrawals unavailable. Public source configuration defaults to paused and requires the operator's own credentials and deployment configuration.

RPC uses the officially listed Blockdaemon endpoint. Public RPC sustained-load availability is not guaranteed. Bounded original-transaction discovery returned no match during the recovery drill; manual Circle execution-ID recovery succeeded. Funding progress/latency optimization is deferred.
