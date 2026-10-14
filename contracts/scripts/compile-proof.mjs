// Local compiler artifact generation only. No wallet/RPC/deployment imports.
import fs from 'node:fs';
import solc from 'solc';
const source=fs.readFileSync('contracts/src/DeliveryProofRegistry.sol','utf8');
const input={language:'Solidity',sources:{'DeliveryProofRegistry.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
const output=JSON.parse(solc.compile(JSON.stringify(input)));
if((output.errors??[]).some(e=>e.severity==='error'))throw Error('Proof candidate compilation failed');
const c=output.contracts['DeliveryProofRegistry.sol'].DeliveryProofRegistry;
const artifact={contractName:'DeliveryProofRegistry',compilerVersion:solc.version(),abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,deployedBytecode:'0x'+c.evm.deployedBytecode.object};
fs.writeFileSync('contracts/artifacts/DeliveryProofRegistry.json',JSON.stringify(artifact,null,2)+'\n');
console.log('Generated local proof candidate artifact. No deployment performed.');
