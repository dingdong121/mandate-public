import assert from 'node:assert/strict';
import { Interface } from 'ethers';
import { route, sqlite } from './route-harness.mjs';
const safe=await route('lib/arc-safety.ts');
const abi=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const from='0x1111111111111111111111111111111111111111',to='0x2222222222222222222222222222222222222222',other='0x3333333333333333333333333333333333333333';
function log(sender=from,recipient=to,amount=100000n,address=safe.USDC){return {address,...abi.encodeEventLog(abi.getEvent('Transfer'),[sender,recipient,amount])};}
const receipt={logs:[log()]};safe.validateUsdcTransfer(receipt,from,to,100000n);
let denied=0;
for(const logs of [[],[log(other)],[log(from,other)],[log(from,to,99999n)],[log(from,to,100000n,other)],[log(),log()]]){
 assert.throws(()=>safe.validateUsdcTransfer({logs},from,to,100000n));denied++;
}
safe.validateUsdcTransfer({logs:[log(),{address:other,topics:[],data:'0x'}]},from,to,100000n);
console.log(`PASS correct transfer and unrelated logs; ${denied} missing/wrong sender/recipient/amount/token/duplicate cases denied. Local fixture only; no transactions sent.`);sqlite.close();
