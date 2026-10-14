// Synthetic memory fixtures only; never produces a production proof or task.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deliveryHashes } from '../scripts/delivery-hashes.mjs';
const sha=b=>'0x'+createHash('sha256').update(b).digest('hex');
const profile=Buffer.from(JSON.stringify({agentId:'synthetic-agent',name:'Synthetic fixture',skills:['Research']}));
const delivery=Buffer.from('Synthetic unit test only\n');
const task={protocol:'mandate-delivery-proof/v1',bountyId:'synthetic-bounty',agentId:'synthetic-agent',title:'Synthetic unit test only',objective:'Verify byte binding',acceptanceCriteria:['Bytes match'],sourceStatus:'submitted',sourceChainId:5042002,agentProfileHash:sha(profile),deliverableHash:sha(delivery)};
const pack=()=>Buffer.from(JSON.stringify(task));let checks=0;
const good=deliveryHashes(pack(),profile,delivery);assert.equal(good.jobKey,sha(pack()));checks++;assert.equal(good.authorization,'NONE');checks++;
const reject=(t=pack(),p=profile,d=delivery)=>{assert.throws(()=>deliveryHashes(t,p,d));checks++;};
reject(pack(),profile,Buffer.from('Modified'));reject(pack(),Buffer.from('{}'));reject(Buffer.from(JSON.stringify({...task,agentId:'other-agent'})));reject(Buffer.from(JSON.stringify({...task,bountyId:''})));reject(Buffer.from(JSON.stringify({...task,ownerId:'private'})));reject(Buffer.from(JSON.stringify({...task,agentProfileHash:'0x00'})));reject(pack(),profile,Buffer.alloc(0));
const changed=deliveryHashes(Buffer.from(JSON.stringify({...task,title:'New approved title'})),profile,delivery);assert.notEqual(changed.jobKey,good.jobKey);checks++;assert.equal(changed.deliverableHash,good.deliverableHash);checks++;
console.log(`PASS ${checks} exact-byte task/profile/delivery binding checks. No production proof generated.`);
