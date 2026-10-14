import app from 'vinext/server/fetch-handler';
import login from './independent-worker';
import { authenticatedAppRequest } from './session-boundary';
import type { LoginEnv } from './email-login';
import {mainnetPreflight} from './mainnet-preflight';

export default {
  async fetch(request: Request, env: LoginEnv & { ASSETS: Fetcher }, ctx: ExecutionContext) {
    const url=new URL(request.url), path=url.pathname;
    if (path === '/signin-with-chatgpt') return Response.redirect(url.origin+'/login',303);
    if (path === '/signout-with-chatgpt') return new Response(`<!doctype html><meta charset="utf-8"><title>退出 Mandate</title><button id="logout">确认退出登录</button><script>document.querySelector('#logout').onclick=async()=>{const r=await fetch('/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(r.ok)location.href='/login';};</script>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
    if (path.startsWith('/auth/') || path.startsWith('/login') || path.startsWith('/brand/') || path==='/health') return login.fetch(request,env);
    // Only immutable framework resources bypass user auth. Worker owns every API.
    if(path.startsWith('/_next/static/') && (request.method==='GET'||request.method==='HEAD')) return env.ASSETS.fetch(request);
    const trusted=await authenticatedAppRequest(request,env.DB);
    if(!trusted.headers.get('oai-authenticated-user-id')) {
      if(path.startsWith('/api/')) return Response.json({error:'Authentication required'},{status:401,headers:{'cache-control':'no-store'}});
      return Response.redirect(url.origin+'/login',303);
    }
    if(path==='/api/mainnet/preflight'){
      if(request.method!=='GET')return Response.json({error:'Read-only endpoint'},{status:405});
      return mainnetPreflight(env);
    }
    return app.fetch(trusted,env,ctx);
  }
};
