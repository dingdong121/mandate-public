import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
const output = ts.transpileModule(fs.readFileSync('lib/email-auth-primitives.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText;
const context = { exports: {}, crypto: webcrypto, TextEncoder };
vm.runInNewContext(output, context);
const auth = context.exports;
assert.equal(auth.normalizeLoginEmail(' User@Example.com '), 'user@example.com');
for (const invalid of [null, '', 'x', 'a\n@example.com']) assert.throws(() => auth.normalizeLoginEmail(invalid));
for (let i = 0; i < 100; i++) assert.match(auth.generateOtp(), /^\d{6}$/);
const secret = 'synthetic-test-secret-not-for-production';
const first = await auth.otpDigest(secret, 'challenge1', 'user@example.com', '012345');
assert.equal(first, await auth.otpDigest(secret, 'challenge1', 'user@example.com', '012345'));
assert.notEqual(first, await auth.otpDigest(secret, 'challenge2', 'user@example.com', '012345'));
assert.notEqual(first, await auth.otpDigest(secret, 'challenge1', 'other@example.com', '012345'));
await assert.rejects(auth.otpDigest('short', 'id', 'user@example.com', '012345'));
const token = auth.generateSessionToken();
assert.match(token, /^[a-f0-9]{64}$/);
assert.notEqual(token, auth.generateSessionToken());
assert.notEqual(await auth.sessionDigest(token), token);
assert.match(auth.sessionCookie(token), /HttpOnly; Secure; SameSite=Lax/);
assert.throws(() => auth.sessionCookie('x; injected=value'));
console.log('PASS email auth primitives: random OTP/token, challenge/email-bound HMAC, secret requirement, session digest and secure cookie. No delivery or live-login verification.');
