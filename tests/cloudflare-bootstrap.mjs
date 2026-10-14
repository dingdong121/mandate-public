import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('deployment/independent-worker.ts', 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {}, Request, Response, URL, require: () => ({ loginPage:'test login', emailLogin: async () => Response.json({error:'Not configured'}, {status:503}) }) };
vm.runInNewContext(output, context);
const worker = context.exports.default;
const health = await worker.fetch(new Request('https://example.invalid/health'));
assert.equal(health.status, 200);
assert.equal((await health.json()).paymentsEnabled, false);
for (const path of ['/', '/api/bounties', '/api/bounties/test/fund', '/signin-with-chatgpt']) {
  for (const method of ['GET', 'POST']) {
    const response = await worker.fetch(new Request(`https://example.invalid${path}`, {
      method, headers: { 'oai-authenticated-user-id': 'forged-owner', 'oai-authenticated-user-email': 'forged@example.invalid' }
    }));
    assert.equal(response.status, 503);
  }
}
assert.equal((await worker.fetch(new Request('https://example.invalid/health', { method: 'POST' }))).status, 503);
console.log('PASS bootstrap: health read-only; app, payment and legacy login paths blocked even with forged identity headers. Not an application auth verification.');
