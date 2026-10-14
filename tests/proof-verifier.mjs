import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Interface } from 'ethers';
import { verifiedArtifact } from '../contracts/scripts/verify-artifact.mjs';
import { verifyProofRecord } from '../scripts/verify-proof-record.mjs';
const sha = b => '0x' + createHash('sha256').update(b).digest('hex');
const registry='0x1111111111111111111111111111111111111111', issuer='0x2222222222222222222222222222222222222222';
const txHash='0x'+'aa'.repeat(32), blockHash='0x'+'bb'.repeat(32);
const profileBytes=Buffer.from(JSON.stringify({agentId:'fixture-agent',name:'Synthetic agent'})), deliveryBytes=Buffer.from('synthetic test bytes; not a real proof');
const taskBytes=Buffer.from(JSON.stringify({protocol:'mandate-delivery-proof/v1',bountyId:'fixture-task',agentId:'fixture-agent',title:'Fixture',objective:'Testing only',acceptanceCriteria:['Fixture'],sourceStatus:'completed',sourceChainId:5042002,agentProfileHash:sha(profileBytes),deliverableHash:sha(deliveryBytes)}));
const {artifact,immutableReferences}=verifiedArtifact('DeliveryProofRegistry'), abi=new Interface(artifact.abi);
let code=artifact.deployedBytecode.slice(2);
for(const refs of Object.values(immutableReferences))for(const {start,length}of refs)code=code.slice(0,start*2)+issuer.slice(2).padStart(length*2,'0')+code.slice((start+length)*2);
const event=abi.encodeEventLog(abi.getEvent('DeliveryRecorded'),[sha(taskBytes),sha(profileBytes),sha(deliveryBytes),10]);
const base={chain:'0x13b2',code:'0x'+code,receipt:{status:'0x1',transactionHash:txHash,to:registry,blockNumber:'0x1',blockHash,logs:[{address:registry,...event}]},blockHash,storedHash:sha(deliveryBytes)};
const input={registry,issuer,txHash,taskBytes,profileBytes,deliveryBytes};
let checks=0;
function rpcFor(state){return async(method,params)=>{
  assert(['eth_chainId','eth_getTransactionReceipt','eth_getBlockByNumber','eth_getCode','eth_call'].includes(method),'Sending is forbidden');
  if(method==='eth_chainId')return state.chain;
  if(method==='eth_getTransactionReceipt')return state.receipt;
  if(method==='eth_getBlockByNumber')return {hash:state.blockHash,timestamp:state.timestamp??'0xa'};
  if(method==='eth_getCode')return state.code;
  const call=abi.parseTransaction({data:params[0].data});
  return call.name==='issuer'?abi.encodeFunctionResult('issuer',[issuer]):abi.encodeFunctionResult('proofs',[sha(profileBytes),state.storedHash,10]);
};}
assert.equal((await verifyProofRecord(rpcFor(base),input)).verified,true);checks++;
for(const state of [
 {...base,chain:'0x4cef52'}, {...base,code:'0x6000'}, {...base,receipt:null},
 {...base,receipt:{...base.receipt,status:'0x0'}}, {...base,receipt:{...base.receipt,to:issuer}},
 {...base,blockHash:txHash}, {...base,timestamp:'0xb'}, {...base,storedHash:txHash},
 {...base,receipt:{...base.receipt,logs:[{address:issuer,...event}]}},
 {...base,receipt:{...base.receipt,logs:[{address:registry,...event},{address:registry,...event}]}},
]){await assert.rejects(verifyProofRecord(rpcFor(state),input));checks++;}
await assert.rejects(verifyProofRecord(rpcFor(base),{...input,deliveryBytes:Buffer.from('tampered')}));checks++;
console.log(`PASS ${checks} read-only proof verifier checks. Synthetic fixtures only; no live Mainnet proof or send.`);
