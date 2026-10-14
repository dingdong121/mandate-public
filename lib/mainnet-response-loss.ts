import {env} from 'cloudflare:workers';
import {assertMainnetTestScope} from './mainnet-test-scope';

// One-time response-loss simulation. No process crash and no repeat send.
// Transaction ID is intentionally not persisted in this hook.
export async function simulateMainnetResponseLoss(bounty:Parameters<typeof assertMainnetTestScope>[0],stage:string,operationId:string){
  if(bounty.chainId!==5042||bounty.id!=='6085a20b-3758-4a4e-af9f-0b96876b00e9'||stage!=='complete_pending')return;
  assertMainnetTestScope(bounty,stage);
  const armed=await env.DB!.prepare('UPDATE mainnet_recovery_drills SET armed=0,consumed_operation_id=? WHERE bounty_id=? AND armed=1 AND consumed_operation_id IS NULL RETURNING bounty_id').bind(operationId,bounty.id).first();
  if(armed)throw new Error('Controlled approved Mainnet post-acceptance response loss');
}
