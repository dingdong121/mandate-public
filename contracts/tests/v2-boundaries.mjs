// Uses the byte-for-byte verified deployment artifact, not a different test build.
import assert from 'node:assert/strict';
import solc from 'solc';
import ganache from 'ganache';
import { ethers } from 'ethers';
import { verifiedArtifact } from '../scripts/verify-artifact.mjs';
const {artifact,immutableReferences,manifest}=verifiedArtifact();
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Token.sol':{content:`pragma solidity ^0.8.24; contract Token { mapping(address=>uint) public balanceOf; uint public mode;
function setMode(uint m) external {mode=m;} function mint(address a,uint n) external {balanceOf[a]+=n;}
function transferFrom(address f,address t,uint n) external returns(bool){return move(f,t,n);} function transfer(address t,uint n) external returns(bool){return move(msg.sender,t,n);}
function move(address f,address t,uint n) internal returns(bool){require(mode!=2,"BLOCKLIST");if(mode==1)return false;require(balanceOf[f]>=n,"BALANCE");balanceOf[f]-=n;balanceOf[t]+=n;return true;}}
`}},settings:{outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
assert(!(output.errors??[]).some(e=>e.severity==='error'));
const rpc=ganache.provider({logging:{quiet:true},chain:{hardfork:'shanghai'},wallet:{totalAccounts:4}});
const provider=new ethers.BrowserProvider(rpc,undefined,{cacheTimeout:-1,pollingInterval:10});
const [client,agent,evaluator,other]=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));
const ca=await client.getAddress(),pa=await agent.getAddress(),ea=await evaluator.getAddress();
const tokenArtifact=output.contracts['Token.sol'].Token;
let checks=0;const check=(a,b)=>{assert.equal(a,b);checks++;};
const send=async p=>(await p).wait();const denied=async p=>{await assert.rejects(p);checks++;};
try{
 const token=await new ethers.ContractFactory(tokenArtifact.abi,tokenArtifact.evm.bytecode.object,client).deploy();await token.waitForDeployment();
 await denied(new ethers.ContractFactory(artifact.abi,artifact.bytecode,client).deploy(ethers.ZeroAddress));
 const escrow=await new ethers.ContractFactory(artifact.abi,artifact.bytecode,client).deploy(await token.getAddress());await escrow.waitForDeployment();
 let expected=artifact.deployedBytecode.slice(2);
 for(const refs of Object.values(immutableReferences))for(const {start,length}of refs){const word=(await token.getAddress()).slice(2).toLowerCase().padStart(length*2,'0');expected=expected.slice(0,start*2)+word+expected.slice((start+length)*2);}
 check((await provider.getCode(await escrow.getAddress())).toLowerCase(),'0x'+expected.toLowerCase());
 await send(token.mint(ca,2n**128n+1000000n));
 let next=1n;const hash=ethers.id('sample');
 async function create(seconds=86400){const now=(await provider.getBlock('latest')).timestamp,expiry=now+seconds;const receipt=await send(escrow.createJob(pa,ea,expiry,'boundary',ethers.ZeroAddress));const parsed=receipt.logs.map(l=>{try{return escrow.interface.parseLog(l);}catch{return null;}}).find(l=>l?.name==='JobCreated');check(parsed.args.jobId,next);return {id:next++,expiry};}
 const now=(await provider.getBlock('latest')).timestamp;
 await denied(escrow.createJob.staticCall(ethers.ZeroAddress,ea,now+100,'',ethers.ZeroAddress));
 await denied(escrow.createJob.staticCall(pa,ethers.ZeroAddress,now+100,'',ethers.ZeroAddress));
 await denied(escrow.createJob.staticCall(pa,ea,now,'',ethers.ZeroAddress));
 await denied(escrow.createJob.staticCall(pa,ea,2n**64n,'',ethers.ZeroAddress));
 const upper=await escrow.createJob.staticCall(pa,ea,2n**64n-1n,'',ethers.ZeroAddress);check(upper,1n);
 const j=await create();await denied(escrow.setBudget.staticCall(j.id,0,'0x'));await denied(escrow.setBudget.staticCall(j.id,2n**128n,'0x'));await send(escrow.setBudget(j.id,2n**128n-1n,'0x'));check((await escrow.jobs(j.id)).budget,2n**128n-1n);await send(escrow.setBudget(j.id,1,'0x'));
 await denied(escrow.connect(other).refund.staticCall(999));await denied(escrow.fund.staticCall(999,'0x'));await denied(escrow.connect(agent).submit.staticCall(j.id,hash,'0x'));
 await send(escrow.fund(j.id,'0x'));await denied(escrow.setBudget.staticCall(j.id,2,'0x'));await send(escrow.connect(agent).submit(j.id,hash,'0x'));
 await denied(escrow.connect(other).reject.staticCall(j.id,hash,'0x'));
 for(const mode of [1,2]){await send(token.setMode(mode));await denied(escrow.connect(evaluator).complete.staticCall(j.id,hash,'0x'));check((await escrow.jobs(j.id)).status,2n);check(await token.balanceOf(await escrow.getAddress()),1n);}
 await send(token.setMode(0));await send(escrow.connect(evaluator).reject(j.id,hash,'0x'));
 await send(token.setMode(2));await denied(escrow.refund.staticCall(j.id));check((await escrow.jobs(j.id)).status,4n);await send(token.setMode(0));await send(escrow.refund(j.id));await denied(escrow.connect(evaluator).complete.staticCall(j.id,hash,'0x'));
 // Exact boundary: approval works at expiry-1; only refund works at expiry.
 const boundary=await create(1000);await send(escrow.setBudget(boundary.id,5,'0x'));await send(escrow.fund(boundary.id,'0x'));await send(escrow.connect(agent).submit(boundary.id,hash,'0x'));
 await rpc.request({method:'evm_setTime',params:[(boundary.expiry-1)*1000]});await rpc.request({method:'evm_mine',params:[]});check((await provider.getBlock('latest')).timestamp,boundary.expiry-1);await escrow.connect(evaluator).complete.staticCall(boundary.id,hash,'0x');checks++;await denied(escrow.refund.staticCall(boundary.id));
 await rpc.request({method:'evm_setTime',params:[boundary.expiry*1000]});await rpc.request({method:'evm_mine',params:[]});check((await provider.getBlock('latest')).timestamp,boundary.expiry);await denied(escrow.connect(evaluator).complete.staticCall(boundary.id,hash,'0x'));await denied(escrow.connect(evaluator).reject.staticCall(boundary.id,hash,'0x'));await escrow.refund.staticCall(boundary.id);checks++;await send(escrow.refund(boundary.id));
 // Deterministic multi-job scenarios: token conservation and escrow liabilities.
 const total=await token.balanceOf(ca)+await token.balanceOf(pa)+await token.balanceOf(await escrow.getAddress());let liability=0n;
 for(let i=0;i<18;i++){
  const x=await create(),amount=BigInt((i*37)%101+1);await send(escrow.setBudget(x.id,amount,'0x'));await send(escrow.fund(x.id,'0x'));liability+=amount;
  check(await token.balanceOf(await escrow.getAddress()),liability);await send(escrow.connect(agent).submit(x.id,hash,'0x'));
  if(i%3===0){await send(escrow.connect(evaluator).reject(x.id,hash,'0x'));await send(escrow.refund(x.id));check((await escrow.jobs(x.id)).status,5n);}else{await send(escrow.connect(evaluator).complete(x.id,hash,'0x'));check((await escrow.jobs(x.id)).status,3n);}
  liability-=amount;check(await token.balanceOf(await escrow.getAddress()),liability);check(await token.balanceOf(ca)+await token.balanceOf(pa)+await token.balanceOf(await escrow.getAddress()),total);
  await denied(escrow.connect(evaluator).complete.staticCall(x.id,hash,'0x'));await denied(escrow.refund.staticCall(x.id));
 }
 console.log(`PASS ${checks} V2 artifact/boundary/exception/conservation checks. Local EVM only; Arc-specific system behavior still needs separate validation.`);console.log(JSON.stringify(manifest,null,2));
}finally{await rpc.disconnect();}
