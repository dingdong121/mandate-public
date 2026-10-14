import {env} from 'cloudflare:workers';
import {fail} from './arc-safety';

export function assertBetaReward(chainId:number,rewardMicros:number){
 if(chainId===5042&&(!Number.isSafeInteger(rewardMicros)||rewardMicros<1||rewardMicros>100000))
  fail('Mainnet Beta reward must be greater than zero and at most 0.10 USDC. Gas is additional.',400);
}

export async function reserveBetaWallet(ownerId:string,agentId:string){
 const existing=await env.DB!.prepare('SELECT agent_id FROM mainnet_beta_wallet_reservations WHERE owner_id=?').bind(ownerId).first<{agent_id:string}>();
 if(existing){if(existing.agent_id!==agentId)fail('Mainnet Beta allows one wallet per account',423);return;}
 try{
  await env.DB!.prepare('INSERT INTO mainnet_beta_wallet_reservations(owner_id,agent_id,day) VALUES (?,?,?)').bind(ownerId,agentId,new Date().toISOString().slice(0,10)).run();
 }catch{fail('Wallet creation quota reached or another wallet is reserved. Beta allows one wallet per account and 20 new wallets per UTC day.',423);}
}
