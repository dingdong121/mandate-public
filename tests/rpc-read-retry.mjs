// Read-only mock transport tests. No network or transactions.
import assert from 'node:assert/strict';
import { state, sqlite, route } from './route-harness.mjs';
const safe=await route('lib/arc-safety.ts');let calls=0,checks=0;
const eq=(a,b)=>{assert.equal(a,b);checks++;};
state.rpcResponseOverride=()=>++calls===1?Response.json({error:{code:-32005}}, {status:429}):Response.json({result:'0x4cef52'});
eq(await safe.rpc('https://mock.invalid','eth_chainId',[]),'0x4cef52');eq(calls,2);
calls=0;state.rpcResponseOverride=()=>{calls++;return Response.json({error:{code:-32602,message:'private-provider-text'}});};
try{await safe.rpc('https://mock.invalid?secret=private','eth_estimateGas',[]);assert.fail();}catch(e){eq(e.status,503);const body=await e.json();eq(body.error.includes('eth_estimateGas'),true);eq(body.error.includes('-32602'),true);eq(body.error.includes('private'),false);}eq(calls,1);
calls=0;state.rpcResponseOverride=()=>{calls++;throw Error('private transport message');};
try{await safe.rpc('https://mock.invalid','eth_getBalance',[]);assert.fail();}catch(e){eq(e.status,503);}eq(calls,2);
calls=0;try{await safe.rpc('https://mock.invalid','eth_sendRawTransaction',[]);assert.fail();}catch(e){eq(e.status,405);}eq(calls,0);
state.rpcResponseOverride=()=>Response.json({result:null});eq(await safe.rpc('https://mock.invalid','eth_getTransactionReceipt',[]),null);
eq(state.sends,0);eq(state.deploySends,0);
console.log(`PASS ${checks} bounded readonly retry / semantic error / redaction / no-send tests.`);sqlite.close();
