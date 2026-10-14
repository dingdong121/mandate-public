import fs from 'node:fs';
import solc from 'solc';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { keccak256 } from 'ethers';
import { pathToFileURL } from 'node:url';
export function verifiedArtifact(contractName = 'BountyEscrow') {
  assert(['BountyEscrow','DeliveryProofRegistry'].includes(contractName), 'Unknown candidate');
  assert.equal(solc.version(), '0.8.24+commit.e11b9ed9.Emscripten.clang', 'Unexpected compiler');
  const source = fs.readFileSync(new URL(`../src/${contractName}.sol`, import.meta.url), 'utf8');
  const input = { language: 'Solidity', sources: { [`${contractName}.sol`]: { content: source } }, settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.deployedBytecode.immutableReferences', 'metadata'] } },
  } };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  assert(!(output.errors ?? []).some(e => e.severity === 'error'), 'Compilation failed');
  const compiled = output.contracts[`${contractName}.sol`][contractName];
  const artifact = JSON.parse(fs.readFileSync(new URL(`../artifacts/${contractName}.json`, import.meta.url), 'utf8'));
  assert.equal(artifact.compilerVersion, solc.version());
  assert.deepEqual(artifact.abi, compiled.abi);
  assert.equal(artifact.bytecode, '0x' + compiled.evm.bytecode.object, 'Creation bytecode mismatch');
  assert.equal(artifact.deployedBytecode, '0x' + compiled.evm.deployedBytecode.object, 'Runtime template mismatch');
  return { artifact, immutableReferences: compiled.evm.deployedBytecode.immutableReferences, manifest: {
    contract: contractName === 'BountyEscrow' ? 'BountyEscrow V2 candidate' : 'DeliveryProofRegistry candidate', compiler: solc.version(), optimizer: input.settings.optimizer,
    evmVersion: JSON.parse(compiled.metadata).settings.evmVersion,
    sourceSha256: createHash('sha256').update(source).digest('hex'), creationKeccak256: keccak256(artifact.bytecode), runtimeTemplateKeccak256: keccak256(artifact.deployedBytecode),
    sourceMatchesArtifact: true, deployedOnArc: false,
    note: 'Verify full runtime with approved constructor immutable substitution, not template hash alone. No deployment is authorized.',
  } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(verifiedArtifact(process.argv[2]).manifest, null, 2));
