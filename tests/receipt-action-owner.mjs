import assert from 'node:assert/strict';
import { route, sqlite } from './route-harness.mjs';
const {canCheckReceipt}=await route('lib/receipt-action-owner.ts');
const base={isParticipant:true,isMine:false,providerAgentId:'agent-a'};
const a=new Set(['agent-a']),b=new Set(['agent-b']);
assert.equal(canCheckReceipt({...base,currentTransactionId:'fund'},a),false);
assert.equal(canCheckReceipt({...base,isMine:true,currentTransactionId:'fund'},b),true);
assert.equal(canCheckReceipt({...base,settlementTransactionId:'submit',settlementStage:'submit_pending'},a),true);
assert.equal(canCheckReceipt({...base,isMine:true,settlementTransactionId:'submit',settlementStage:'submit_pending'},b),false);
for(const stage of ['complete_pending','refund_pending','reject_pending']){
 assert.equal(canCheckReceipt({...base,settlementTransactionId:'tx',settlementStage:stage},a),false);
 assert.equal(canCheckReceipt({...base,isMine:true,settlementTransactionId:'tx',settlementStage:stage},b),true);
}
assert.equal(canCheckReceipt(base,a),false);
assert.equal(canCheckReceipt({...base,isParticipant:false,isMine:true,currentTransactionId:'tx'},b),false);
console.log('PASS receipt action ownership: funding/client settlement belongs to publisher; submission belongs to selected Agent owner.');
sqlite.close();
