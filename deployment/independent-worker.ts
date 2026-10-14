// Bootstrap only: deliberately does not expose the legacy header-authenticated app.
// Replace only after an independent authentication boundary passes isolation tests.
import { emailLogin, type LoginEnv } from './email-login';
import { loginPage } from './login-page';
import { arcThemePreview } from './arc-theme-preview';
export default {
  async fetch(request: Request, env: LoginEnv & { MAINNET_CHAIN_WRITES_ENABLED?:string; MAINNET_WALLET_CREATION_ENABLED?:string; ASSETS?: { fetch(request: Request): Promise<Response> } }): Promise<Response> {
    const path = new URL(request.url).pathname;
    if ((request.method === 'GET' || request.method === 'HEAD') && ['/brand/mandate.png', '/brand/mandate-fold-m.png'].includes(path) && env.ASSETS) return env.ASSETS.fetch(request);
    if (request.method === 'GET' && ['/login', '/login-preview-arc', '/login-preview-green'].includes(path)) return new Response(path === '/login-preview-green' ? loginPage : arcThemePreview, { headers: {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; img-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer'
    } });
    if (path.startsWith('/auth/')) return emailLogin(request, env);
    const read = request.method === "GET" || request.method === "HEAD";
    if (read && path === "/health") {
      return Response.json({ service: "mandate", stage: "restricted-mainnet-validation", paymentsEnabled: false, publicPaymentsEnabled:false, approvedTestTransactionsEnabled:env.MAINNET_CHAIN_WRITES_ENABLED==='mainnet-approved', walletCreationMode:env.MAINNET_WALLET_CREATION_ENABLED==='mainnet-approved'?'two-approved-test-agents':'paused', withdrawalsEnabled:false }, {
        headers: { "cache-control": "no-store" }
      });
    }
    return Response.json({ error: "Migration preparation. Login and payments are not enabled." }, {
      status: 503,
      headers: { "cache-control": "no-store", "retry-after": "3600" }
    });
  }
};
