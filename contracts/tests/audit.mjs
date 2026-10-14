// Local-only regression audit. Never connects to Arc or Circle.
// Uses pinned project test dependencies; all wallets are ephemeral local wallets.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import solc from 'solc';
const require = createRequire(new URL('../../package.json',import.meta.url));
const { ethers } = require('ethers');
const ganache = require('ganache');
const mock = `pragma solidity ^0.8.24;
contract Token {
 mapping(address=>uint) public balanceOf; bool public fail; address public target; bool public attempted; bool public blocked; bool public guarded;
 function mint(address a,uint n) external {balanceOf[a]+=n;}
 function setFail(bool f) external {fail=f;}
 function setTarget(address t) external {target=t;}
 function transferFrom(address f,address t,uint n) external returns(bool){if(fail)return false;require(balanceOf[f]>=n);balanceOf[f]-=n;balanceOf[t]+=n;return true;}
 function transfer(address t,uint n) external returns(bool){if(fail)return false;if(target!=address(0)){attempted=true;(bool ok,bytes memory reason)=target.call(abi.encodeWithSignature("refund(uint256)",1));blocked=!ok;guarded=keccak256(reason)==keccak256(abi.encodeWithSignature("Error(string)","REENTRANCY"));}require(balanceOf[msg.sender]>=n);balanceOf[msg.sender]-=n;balanceOf[t]+=n;return true;}
}`;
const input={language:'Solidity',sources:{'Escrow.sol':{content:fs.readFileSync(new URL('../src/BountyEscrow.sol',import.meta.url),'utf8')},'Token.sol':{content:mock}},settings:{outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
const out=JSON.parse(solc.compile(JSON.stringify(input)));
assert(!(out.errors||[]).some(e=>e.severity==='error'));
const rpc=ganache.provider({logging:{quiet:true},wallet:{totalAccounts:4},chain:{hardfork:'shanghai'}});
const provider=new ethers.BrowserProvider(rpc,undefined,{cacheTimeout:-1});
const [client,agent,evaluator,stranger]=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));
const a=await agent.getAddress(), e=await evaluator.getAddress();
async function deploy(file,name,args=[]){const c=out.contracts[file][name];return await new ethers.ContractFactory(c.abi,c.evm.bytecode.object,client).deploy(...args).then(async x=>{await x.waitForDeployment();return x;});}
async function tx(p){await (await p).wait();}
let checks=0;
async function denied(p){await assert.rejects(async()=>tx(p));checks++;}
async function fixture(){const token=await deploy('Token.sol','Token');const escrow=await deploy('Escrow.sol','BountyEscrow',[await token.getAddress()]);await tx(token.mint(await client.getAddress(),1000));return {token,escrow};}
async function create(escrow,seconds=100){const b=await provider.getBlock('latest');await tx(escrow.createJob(a,e,b.timestamp+seconds,'local audit',ethers.ZeroAddress));await tx(escrow.setBudget(1,100,'0x'));}
try {
 const {token,escrow}=await fixture();await create(escrow);
 await denied(escrow.connect(stranger).setBudget(1,100,'0x'));
 await denied(escrow.connect(stranger).fund(1,'0x'));
 await tx(escrow.fund(1,'0x'));await denied(escrow.fund(1,'0x'));
 const hash=ethers.id('deliverable');
 await denied(escrow.connect(stranger).submit(1,hash,'0x'));
 await denied(escrow.connect(agent).submit(1,ethers.ZeroHash,'0x'));
 await denied(escrow.refund(1));
 await tx(escrow.connect(agent).submit(1,hash,'0x'));
 await denied(escrow.connect(stranger).complete(1,hash,'0x'));
 await tx(token.setFail(true));await denied(escrow.connect(evaluator).complete(1,hash,'0x'));
 assert.equal((await escrow.jobs(1)).status,2n);checks++;
 await tx(token.setFail(false));await tx(token.setTarget(await escrow.getAddress()));
 await tx(escrow.connect(evaluator).complete(1,hash,'0x'));
 assert.equal(await token.balanceOf(a),100n);assert(await token.attempted());assert(await token.blocked());assert(await token.guarded());checks+=4;
 await denied(escrow.connect(evaluator).complete(1,hash,'0x'));await denied(escrow.refund(1));
 const f=await fixture();await create(f.escrow);await tx(f.token.setFail(true));await denied(f.escrow.fund(1,'0x'));assert.equal((await f.escrow.jobs(1)).status,0n);checks++;
 await tx(f.token.setFail(false));await tx(f.escrow.fund(1,'0x'));await tx(f.escrow.connect(agent).submit(1,hash,'0x'));await tx(f.escrow.connect(evaluator).reject(1,hash,'0x'));await tx(f.escrow.refund(1));assert.equal(await f.token.balanceOf(await client.getAddress()),1000n);checks++;await denied(f.escrow.refund(1));
 const timeout=await fixture();await create(timeout.escrow);await tx(timeout.escrow.fund(1,'0x'));await tx(timeout.escrow.connect(agent).submit(1,hash,'0x'));await rpc.request({method:'evm_increaseTime',params:[101]});await rpc.request({method:'evm_mine',params:[]});
 await timeout.escrow.refund.staticCall(1);checks++;
 await denied(timeout.escrow.connect(evaluator).complete(1,hash,'0x'));
 await denied(timeout.escrow.connect(evaluator).reject(1,hash,'0x'));
 await tx(timeout.escrow.refund(1));await denied(timeout.escrow.connect(evaluator).complete(1,hash,'0x'));
 const overflow=await fixture();await denied(overflow.escrow.createJob(a,e,2n**64n+1n,'local overflow',ethers.ZeroAddress));
 await denied(overflow.escrow.createJob(a,e,1,'past',ethers.ZeroAddress));
 console.log(`PASS ${checks} local assertions / rejection checks. Patched source only; existing deployed V1 contracts are unchanged. Not mainnet clearance.`);
} finally {await rpc.disconnect();}
