import { fail } from './arc-safety';
import {env} from 'cloudflare:workers';

// Temporary live test authorization. Not a general Mainnet release switch.
export function assertMainnetTestScope(bounty:{id:string;chainId:number;rewardMicros:number;ownerId:string;providerAgentId:string|null},stage:string){
  if(bounty.chainId!==5042)return;
  if(env?.PUBLIC_MAINNET_BETA_ENABLED==='enabled'){
    if(!Number.isSafeInteger(bounty.rewardMicros)||bounty.rewardMicros<1||bounty.rewardMicros>100000||!bounty.ownerId||!bounty.providerAgentId||!['create_job_pending','budget_pending','approve_pending','fund_pending','submit_pending','complete_pending','reject_pending','refund_pending'].includes(stage))
      fail('Small-value Mainnet Beta permits rewards up to 0.10 USDC and supported escrow actions only',423);
    return;
  }
  const stages=['b23f270b-3d8b-4f05-aea1-398644ca1295','6085a20b-3758-4a4e-af9f-0b96876b00e9'].includes(bounty.id)?['create_job_pending','budget_pending','approve_pending','fund_pending','submit_pending','complete_pending']:bounty.id==='3575c13d-051f-4cec-ac70-35db0af0fce6'?['create_job_pending','budget_pending','approve_pending','fund_pending','submit_pending','reject_pending','refund_pending']:[];
  if(bounty.rewardMicros!==10000||bounty.ownerId!=='email_51b8b27d-62ea-4048-a61c-3e10418094c1'||bounty.providerAgentId!=='f31f7f50-5812-470c-af63-fb0e6b6b07c1'||!stages.includes(stage)){
    fail('Only the explicitly approved 0.01 USDC Mainnet payment test is permitted',423);
  }
}
