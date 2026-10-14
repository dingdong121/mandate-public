import type { LoginEnv } from './email-login';
type Env=LoginEnv & {CIRCLE_MAINNET_API_KEY?:string;CIRCLE_MAINNET_ENTITY_SECRET?:string;CIRCLE_MAINNET_WALLET_SET_ID?:string;MAINNET_CHAIN_WRITES_ENABLED?:string;MAINNET_WALLET_CREATION_ENABLED?:string};
// Authenticated, GET-only diagnostics: no signature, provisioning or send endpoint.
export async function mainnetPreflight(env:Env){
  const checks={credentialsPresent:Boolean(env.CIRCLE_MAINNET_API_KEY&&env.CIRCLE_MAINNET_ENTITY_SECRET),walletSetConfigured:env.CIRCLE_MAINNET_WALLET_SET_ID==='04055d05-584c-4f9b-a871-6922dfa63cae',deployerWalletVerified:false,contractRegistered:false,chainWritesPaused:env.MAINNET_CHAIN_WRITES_ENABLED!=='mainnet-approved',walletCreationPaused:env.MAINNET_WALLET_CREATION_ENABLED!=='mainnet-approved'};
  if(checks.credentialsPresent){try{
    const response=await fetch('https://api.circle.com/v1/w3s/wallets/944ae07a-614a-4f32-a246-bba99582e84c',{headers:{authorization:`Bearer ${env.CIRCLE_MAINNET_API_KEY}`},signal:AbortSignal.timeout(10000)});
    if(response.ok){const body=await response.json() as {data?:{wallet?:{address?:string;blockchain?:string;walletSetId?:string;custodyType?:string;accountType?:string}}};const w=body.data?.wallet;
    checks.deployerWalletVerified=Boolean(w?.address?.toLowerCase()==='0x0000000000000000000000000000000000000001'&&w.blockchain==='ARC'&&w.walletSetId===env.CIRCLE_MAINNET_WALLET_SET_ID&&w.custodyType==='DEVELOPER'&&w.accountType==='EOA');}
  }catch{/* Do not expose provider errors or headers. */}}
  checks.contractRegistered=Boolean(await env.DB.prepare("SELECT id FROM contract_deployments WHERE chain_id=5042 AND contract_version=2 AND status='complete' AND contract_address=? AND tx_hash=?").bind('0x55b621a5be3fbfd9bd075bdaa01c30b0dc259e2d','0x4107abdc97876f2fa305dadcd1362ae6d625a9d2b282759ed0ec49b49073bba4').first());
  return Response.json({checks,transactionSent:false,signingPermissionVerified:false,note:'Read-only configuration checks do not prove Entity Secret registration or signing permission.'},{headers:{'cache-control':'no-store'}});
}
