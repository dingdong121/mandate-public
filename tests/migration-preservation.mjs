// In-memory synthetic pre-migration fixture only; never opens a real DB.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
const db=new DatabaseSync(':memory:');const files=fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();
for(const f of files.slice(0,9))db.exec(fs.readFileSync(`drizzle/${f}`,'utf8'));
for(let i=1;i<=11;i++)db.prepare("INSERT INTO agents(id,owner_id,name,status,wallet_provider,wallet_id,wallet_address) VALUES (?,'original-user',?,'active','circle',?,?)").run(`agent-${i}`,`Synthetic Agent ${i}`,`synthetic-wallet-${i}`,'0x'+String(i).padStart(40,'0'));
for(let i=1;i<=4;i++)db.prepare("INSERT INTO bounties(id,owner_id,title,objective,acceptance_criteria,reward_micros,deadline,status,provider_agent_id,complete_tx_hash) VALUES (?,'original-user',?,'synthetic','[]',100000,'2026-09-18',?,'agent-1',?)").run(`job-${i}`,`Synthetic Job ${i}`,i===1?'completed':'open',i===1?'fixed-history-hash':null);
db.prepare("INSERT INTO contract_deployments(id,owner_id,kind,circle_contract_id,transaction_id,contract_address,tx_hash,status) VALUES ('old-escrow','original-user','bounty_escrow','fixed-circle-id','fixed-tx','fixed-address','fixed-hash','complete')").run();
const tables=['agents','bounties','contract_deployments'];const columns=new Map(tables.map(t=>[t,db.prepare(`PRAGMA table_info(${t})`).all().map(c=>c.name)]));
const snapshot=()=>JSON.stringify(tables.map(t=>db.prepare(`SELECT ${columns.get(t).join(',')} FROM ${t} ORDER BY id`).all()));const before=snapshot();
for(const f of files.slice(9))db.exec(fs.readFileSync(`drizzle/${f}`,'utf8'));assert.equal(snapshot(),before);
assert.equal(db.prepare("SELECT chain_id FROM contract_deployments WHERE id='old-escrow'").get().chain_id,5042002);
assert.equal(db.prepare("SELECT contract_version FROM contract_deployments WHERE id='old-escrow'").get().contract_version,1);
for(const [id,chain,version]of [['new-testnet-v2',5042002,2],['mainnet-fixture',5042,2]])db.prepare("INSERT INTO contract_deployments(id,owner_id,kind,chain_id,contract_version,circle_contract_id,transaction_id,status) VALUES (?,'original-user','bounty_escrow',?,?,'synthetic','synthetic','pending')").run(id,chain,version);
assert.equal(db.prepare('SELECT count(*) AS n FROM contract_deployments').get().n,3);
assert.equal(db.prepare("SELECT status FROM bounties WHERE id='job-1'").get().status,'completed');
console.log('PASS migration invariants: 11 synthetic Agents, 4 Bounties, all original columns/IDs/wallet bindings/hashes unchanged; old V1 preserved alongside V2 and Mainnet metadata. Not a production backup verification.');db.close();
