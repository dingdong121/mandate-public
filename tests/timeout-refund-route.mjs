// Focused missing route regression. Mock Circle/RPC, not a live timeout refund.
import assert from 'node:assert/strict';
import { env,state,sqlite,route,seed,call,row,complete,contract } from './route-harness.mjs';
const settle=await route('app/api/bounties/[id]/settle/route.ts');
env.CHAIN_WRITES_ENABLED='testnet-approved';
for(const status of ['funded','submitted','revision_requested']) {
 const id='timeout-'+status;seed(id);
 sqlite.prepare("UPDATE bounties SET status=?,deadline=?,funding_stage='funded',contract_address=?,onchain_job_id='10' WHERE id=?").run(status,new Date(Date.now()-60000).toISOString(),contract,id);
 const before=state.sends;
 for(const action of ['approve','reject'])assert.equal((await call(settle,id,'POST',{action},'A')).status,409);
 assert.equal((await call(settle,id,'POST',{action:'refund'},'B')).status,403);
 assert.equal(state.sends,before);
 const replies=await Promise.all(Array.from({length:8},()=>call(settle,id,'POST',{action:'refund'},'A')));
 assert.equal(replies.filter(r=>r.status===202).length,1);assert.equal(state.sends,before+1);
 complete(id,false);assert.equal((await call(settle,id,'POST',{action:'reconcile'},'A')).status,200);
 assert.equal(row(id).status,'expired');assert.equal((await call(settle,id,'POST',{action:'refund'},'A')).status,409);
 assert.equal(state.sends,before+1);
}
console.log('PASS expiry refund in funded/submitted/revision states; late approve/reject, agent refund and duplicate clicks denied. MOCK only, no live transaction.');
sqlite.close();
