import {env} from 'cloudflare:workers';
import {fail} from './arc-safety';
import {assertMainnetTestScope} from './mainnet-test-scope';

export async function executionFee(bounty:Parameters<typeof assertMainnetTestScope>[0],stage:string,operationId:string){
  if(bounty.chainId!==5042)return {type:'level' as const,config:{feeLevel:'MEDIUM' as const}};
  assertMainnetTestScope(bounty,stage);
  const refund=bounty.id==='3575c13d-051f-4cec-ac70-35db0af0fce6';
  const table=refund?'mainnet_refund_gas_reservations':'mainnet_test_gas_reservations';
  const reservation=refund?25000:30000;
  try {
    await env.DB!.prepare(`INSERT INTO ${table}(bounty_id,stage,operation_id,reserved_micros) VALUES (?,?,?,?) ON CONFLICT(bounty_id,stage) DO NOTHING`).bind(bounty.id,stage,operationId,reservation).run();
    const reserved=await env.DB!.prepare(`SELECT operation_id FROM ${table} WHERE bounty_id=? AND stage=?`).bind(bounty.id,stage).first<{operation_id:string}>();
    if(reserved?.operation_id!==operationId)fail('This stage already reserved its Gas budget; recover the original operation instead of resending',423);
  }catch(error){if(error instanceof Response)throw error;fail('Mainnet Gas budget could not be reserved; no transaction sent',423);}
  // Arc native USDC has 18 decimals: 500000 * 60 gwei = 0.03 USDC.
  return {type:'absolute' as const,config:{gasLimit:'500000',maxFee:refund?'50':'60',priorityFee:'11'}};
}
