import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const root = process.cwd();
const sourcePath = path.join(root, "contracts/src/BountyEscrow.sol");
const source = fs.readFileSync(sourcePath, "utf8");
const input = {
  language: "Solidity",
  sources: { "BountyEscrow.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));
const contract = output.contracts["BountyEscrow.sol"].BountyEscrow;
const artifact = {
  contractName: "BountyEscrow",
  compilerVersion: solc.version(),
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
  deployedBytecode: `0x${contract.evm.deployedBytecode.object}`,
};
const artifactDirectory = path.join(root, "contracts/artifacts");
fs.mkdirSync(artifactDirectory, { recursive: true });
fs.writeFileSync(path.join(artifactDirectory, "BountyEscrow.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Compiled ${artifact.contractName} with ${artifact.compilerVersion}`);
