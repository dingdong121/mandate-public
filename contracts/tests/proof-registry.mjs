import assert from 'node:assert/strict';
import ganache from 'ganache';
import { ethers } from 'ethers';
import { verifiedArtifact } from '../scripts/verify-artifact.mjs';
const {artifact,immutableReferences}=verifiedArtifact('DeliveryProofRegistry');
const rpc=ganache.provider({logging:{quiet:true}}),provider=new ethers.BrowserProvider(rpc,undefined,{cacheTimeout:-1,pollingInterval:10});
let checks=0;const check=(a,b)=>{assert.equal(a,b);checks++;};const denied=async p=>{await assert.rejects(p);checks++;};
try{
 const owner=await provider.getSigner(0),stranger=await provider.getSigner(1),address=await owner.getAddress();const factory=new ethers.ContractFactory(artifact.abi,artifact.bytecode,owner);
 await denied(factory.deploy(ethers.ZeroAddress));const registry=await factory.deploy(address);await registry.waitForDeployment();check(await registry.issuer(),address);
 let expected=artifact.deployedBytecode.slice(2);for(const refs of Object.values(immutableReferences))for(const {start,length}of refs){expected=expected.slice(0,start*2)+address.slice(2).toLowerCase().padStart(length*2,'0')+expected.slice((start+length)*2);}check((await provider.getCode(await registry.getAddress())).toLowerCase(),'0x'+expected.toLowerCase());
 const job=ethers.id('separate-grant-task'),agent=ethers.id('public-agent-identifier'),delivery=ethers.id('actual-public-deliverable');
 await denied(registry.connect(stranger).record.staticCall(job,agent,delivery));
 for(const args of [[ethers.ZeroHash,agent,delivery],[job,ethers.ZeroHash,delivery],[job,agent,ethers.ZeroHash]])await denied(registry.record.staticCall(...args));
 await denied(registry.record.staticCall(job,agent,delivery,{value:1}));
 const receipt=await(await registry.record(job,agent,delivery)).wait();const event=receipt.logs.map(l=>registry.interface.parseLog(l)).find(l=>l.name==='DeliveryRecorded');check(event.args.jobKey,job);check(event.args.deliverableHash,delivery);check((await registry.proofs(job)).deliverableHash,delivery);
 await denied(registry.record.staticCall(job,agent,ethers.id('overwrite')));await denied(owner.sendTransaction({to:await registry.getAddress(),value:1}));check(await provider.getBalance(await registry.getAddress()),0n);
 check((await registry.proofs(ethers.id('unknown'))).recordedAt,0n);
 console.log(`PASS ${checks} non-custodial proof candidate checks. NOT deployed, NOT payment evidence, NOT independently audited.`);
 console.log(JSON.stringify({scope:'LOCAL_STANDARD_EVM_ONLY',deploymentGasUsed:String((await registry.deploymentTransaction().wait()).gasUsed),firstRecordGasUsed:String(receipt.gasUsed),note:'Fixture addresses/hashes only. Not a production estimate or signing authorization.'}));
}finally{await rpc.disconnect();}
