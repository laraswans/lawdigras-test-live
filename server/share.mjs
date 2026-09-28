import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { jsonStore } from './store.mjs';

const shares = jsonStore(process.env.SHARE_STORE ?? 'data/shares.json');
function secret() {
  const s = process.env.SHARE_SIGNING_SECRET;
  if (!s || s.length < 32) throw new Error('SHARE_SIGNING_SECRET must be set (32+ characters)');
  return s;
}
const sign = id => createHmac('sha256', secret()).update(id).digest('base64url');

export async function createShare({ matterId, provider, sections, update, days = 14 }) {
  const id = randomBytes(12).toString('base64url'), password = randomBytes(6).toString('base64url'), salt = randomBytes(16);
  await shares.set(id, {
    matterId, provider, sections, update, expiresAt: Date.now() + days * 86400000, revoked: false,
    salt: salt.toString('hex'), hash: scryptSync(password, salt, 32).toString('hex'), opens: [],
  });
  return { id, token: `${id}.${sign(id)}`, password }; // the password is shown once to the paralegal, never stored in clear
}

export async function openShare(token, password) {
  const [id, sig] = String(token ?? '').split('.');
  if (!id || !sig) return { error: 'invalid link' };
  const expected = sign(id);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return { error: 'invalid link' };
  const share = await shares.get(id);
  if (!share || share.revoked || share.expiresAt < Date.now()) return { error: 'link expired or revoked' };
  const hash = scryptSync(String(password ?? ''), Buffer.from(share.salt, 'hex'), 32);
  if (!timingSafeEqual(hash, Buffer.from(share.hash, 'hex'))) return { error: 'wrong password' };
  share.opens.push(new Date().toISOString()); // an open, not proof of reading
  await shares.set(id, share);
  return { share };
}

export async function revokeShare(id) {
  const share = await shares.get(id);
  if (!share) return false;
  share.revoked = true; await shares.set(id, share);
  return true;
}
