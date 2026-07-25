import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { hostname, userInfo } from 'node:os';

const ALGO = 'aes-256-gcm';
const SALT = 'freemodelfinder.v1';

// v2 key material is stable across hostname changes (macOS notoriously
// switches hostname when joining/leaving networks). Falling back to v1
// materials is only kept for reading legacy payloads.
function deriveKeyV2(): Buffer {
  const material = `${userInfo().username}::${SALT}`;
  return scryptSync(material, SALT, 32);
}

function deriveKeyV1(host: string): Buffer {
  const material = `${userInfo().username}::${host}::${SALT}`;
  return scryptSync(material, SALT, 32);
}

function candidateV1Hosts(): string[] {
  const seen = new Set<string>();
  const push = (h: string | undefined | null) => {
    if (!h) return;
    if (seen.has(h)) return;
    seen.add(h);
  };
  push(hostname());
  const h = hostname();
  // hostname() may return either the short name or the .local FQDN — try both.
  push(h.replace(/\.local$/i, ''));
  push(`${h.replace(/\.local$/i, '')}.local`);
  // Common macOS default hostnames people end up with.
  push('Mac');
  push('MacBook-Pro');
  push('MacBook-Air');
  push('localhost');
  return [...seen];
}

export function encryptString(plaintext: string): string {
  const key = deriveKeyV2();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function tryDecrypt(key: Buffer, ivB64: string, tagB64: string, encB64: string): string | null {
  try {
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(encB64, 'base64')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}

export function decryptString(payload: string): string {
  if (payload.startsWith('v2:')) {
    const [, ivB64, tagB64, encB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !encB64) throw new Error('invalid encrypted payload');
    const out = tryDecrypt(deriveKeyV2(), ivB64, tagB64, encB64);
    if (out === null) throw new Error('decryption failed (v2 key mismatch)');
    return out;
  }
  if (payload.startsWith('v1:')) {
    const [, ivB64, tagB64, encB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !encB64) throw new Error('invalid encrypted payload');
    for (const host of candidateV1Hosts()) {
      const out = tryDecrypt(deriveKeyV1(host), ivB64, tagB64, encB64);
      if (out !== null) return out;
    }
    throw new Error('decryption failed (v1 key mismatch; hostname changed?)');
  }
  // No known prefix — assume plaintext.
  return payload;
}

// Returns true if the payload looks like an encrypted (still non-decrypted)
// blob, so callers can avoid sending it out as a bearer token.
export function looksEncrypted(payload: string): boolean {
  return /^v[12]:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(payload);
}
