// Real process termination + persistent SQLite; provider is a LOCAL stand-in.
// Not a live Circle or hosted Worker interruption test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fork} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

if(process.argv[2]==='child'){
 const db=new DatabaseSync(process.argv[3]);
 const d1={prepare(sql){let params=[];return {bind(...p){params=p;return this;},async first(){return db.prepare(sql).get(...params)??null;},async run(){return db.prepare(sql).run(...params);}};}};
 const env={DB:d1};
 const source=ts.transpileModule(fs.readFileSync('lib/financial-operations.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(source,{module,exports:module.exports,require(spec){if(spec==='cloudflare:workers')return {env};if(spec==='./arc-safety')return {fail(message,status=409){throw new Response(JSON.stringify({error:message}),{status});},requestKey(r){return r.headers.get('idempotency-key');}};throw Error('Unexpected dependency');},crypto,TextEncoder,Response,Date});
 const request=new Request('https://local.test',{headers:{'idempotency-key':'ab7150ea-628d-4599-a5d7-440757e05136'}});
 if(process.argv[4]==='crash'){
  const op=await module.exports.claimOperation(request,'B',5042002,'bounty:crash','complete_pending',{job:4});
  assert(op.fresh);
  // Stand-in provider persists acceptance, while app never stores its tx ID.
  db.prepare('INSERT INTO provider_acceptance(circle_key,tx_id) VALUES (?,?)').run(op.circle_key,'accepted-original-tx');
  process.send({accepted:true});setInterval(()=>{},1000);
 }else{
  for(let i=0;i<8;i++)await assert.rejects(()=>module.exports.claimOperation(request,'B',5042002,'bounty:crash','complete_pending',{job:4}),e=>e instanceof Response&&e.status===409);
  const op=db.prepare('SELECT * FROM financial_operations').get();
  assert.equal(op.status,'claimed');assert.equal(op.transaction_id,null);
  assert.equal(db.prepare('SELECT count(*) n FROM provider_acceptance').get().n,1);
  // Fixture-only manual evidence attachment. Production equivalent is NOT
  // implemented by this test and must not be claimed as verified.
  const accepted=db.prepare('SELECT * FROM provider_acceptance').get();assert.equal(accepted.circle_key,op.circle_key);
  db.prepare("UPDATE financial_operations SET transaction_id=?,status='submitted' WHERE id=? AND status='claimed'").run(accepted.tx_id,op.id);
  const replay=await module.exports.claimOperation(request,'B',5042002,'bounty:crash','complete_pending',{job:4});assert.equal(replay.fresh,false);assert.equal(replay.transaction_id,accepted.tx_id);
  await module.exports.reconcileOperation(accepted.tx_id);
  console.log('PASS real SIGKILL / durable claimed key / 8 retries denied / one local provider acceptance / fixture-only original-ID attachment. LIVE provider and production hard-crash recovery remain unverified.');db.close();
 }
}else{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mandate-crash-')),file=path.join(dir,'test.sqlite');
 const db=new DatabaseSync(file);
 for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',name),'utf8'));
 db.exec('CREATE TABLE provider_acceptance(circle_key TEXT UNIQUE,tx_id TEXT UNIQUE)');db.close();
 const child=fork(new URL(import.meta.url),['child',file,'crash'],{stdio:['ignore','inherit','inherit','ipc']});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('No acceptance signal'));},10000);child.once('message',message=>{clearTimeout(timer);assert(message.accepted);resolve();});child.once('error',reject);});
 const exit=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await exit;
 const restart=fork(new URL(import.meta.url),['child',file,'verify'],{stdio:['ignore','inherit','inherit','ipc']});
 await new Promise((resolve,reject)=>{restart.once('exit',code=>code===0?resolve():reject(Error(`Restart failed: ${code}`)));restart.once('error',reject);});
 console.log(`Synthetic crash evidence database retained at ${file}; no production data touched.`);
}
