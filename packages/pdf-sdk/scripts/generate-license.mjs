#!/usr/bin/env node
/**
 * Vendor tool: mint pdfcraft SDK license keys (offline ECDSA P-256).
 *
 *   node scripts/generate-license.mjs keypair
 *     → prints a fresh public/private JWK pair. Embed the PUBLIC key in
 *       src/license.ts; keep the PRIVATE key out of the repo.
 *
 *   PRIVATE_JWK='<json>' node scripts/generate-license.mjs sign \
 *     --licensee "Acme Corp" --exp 2027-06-30 [--domains acme.com,app.acme.com]
 *     → prints the license key (PC1.<payload>.<sig>).
 */
import { webcrypto as crypto } from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const [cmd, ...rest] = process.argv.slice(2);
const arg = (name) => {
  const i = rest.indexOf('--' + name);
  return i >= 0 ? rest[i + 1] : undefined;
};

if (cmd === 'keypair') {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  console.log('PUBLIC JWK (embed in src/license.ts):');
  console.log(JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, null, 2));
  console.log('\nPRIVATE JWK (keep secret — used to sign):');
  console.log(JSON.stringify(priv));
} else if (cmd === 'sign') {
  const privJson = process.env.PRIVATE_JWK;
  if (!privJson) { console.error('Set PRIVATE_JWK env var.'); process.exit(1); }
  const licensee = arg('licensee');
  const exp = arg('exp');
  if (!licensee || !exp) { console.error('Required: --licensee, --exp YYYY-MM-DD'); process.exit(1); }
  const domains = arg('domains')?.split(',').map((s) => s.trim()).filter(Boolean);
  const payload = JSON.stringify(domains?.length ? { licensee, exp, domains } : { licensee, exp });
  const key = await crypto.subtle.importKey('jwk', JSON.parse(privJson), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(payload));
  console.log(`PC1.${b64url(new TextEncoder().encode(payload))}.${b64url(sig)}`);
} else {
  console.error('Usage: generate-license.mjs keypair | sign --licensee NAME --exp YYYY-MM-DD [--domains a.com,b.com]');
  process.exit(1);
}
