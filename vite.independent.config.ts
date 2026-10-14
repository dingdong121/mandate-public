import vinext from 'vinext';
import { defineConfig } from 'vite';

// Independent build candidate only. Does NOT use Sites packaging/mock identity.
// Never deploy this candidate before adding the verified session boundary.
export default defineConfig(async () => {
  process.env.WRANGLER_LOG_PATH ??= '/private/tmp/mandate-independent-build.log';
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  return {
    plugins: [vinext(), cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      inspectorPort: false,
      config: {
        name: 'mandate-independent',
        account_id: '00000000000000000000000000000000',
        main: 'deployment/app-worker.ts',
        workers_dev: true,
        routes: [],
        preview_urls: false,
        assets: { directory: 'deployment/assets', binding: 'ASSETS', run_worker_first: true },
        compatibility_date: '2026-10-14',
        compatibility_flags: ['nodejs_compat'],
        d1_databases: [{ binding: 'DB', database_name: 'mandate-production', database_id: 'f498a657-1871-4a34-a3ea-2fce9044e143' }],
        vars: { EMAIL_LOGIN_ENABLED:'enabled', PAYMENT_CHAIN_ID:'5042', CIRCLE_MAINNET_WALLET_SET_ID:'04055d05-584c-4f9b-a871-6922dfa63cae', ARC_MAINNET_RPC_URL:'https://rpc.blockdaemon.mainnet.arc.io', CHAIN_WRITES_ENABLED:'paused', WALLET_CREATION_ENABLED:'paused', MAINNET_CHAIN_WRITES_ENABLED:'paused', MAINNET_WALLET_CREATION_ENABLED:'paused', PUBLIC_MAINNET_BETA_ENABLED:'paused' }
      }
    })]
  };
});
