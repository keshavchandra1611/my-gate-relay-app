/*
 * Encrypts the PIN for the gate device (AES-256-GCM) so the MQTT broker can never read it.
 *   key       = SHA-256(APP_SECRET)                 (APP_SECRET is never sent)
 *   iv        = first 12 bytes of the device's one-time challenge
 *   aad       = the whole 16-byte challenge (binds the message to this exchange)
 *   plaintext = the PIN
 * Output: hex(ciphertext || 16-byte tag). The firmware decrypts and checks the tag.
 */
import { gcm } from '@noble/ciphers/aes.js';
import { sha256 } from 'js-sha256';

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) throw new Error('bad hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

export function encryptPin(secret: string, challengeHex: string, pin: string): string {
  const challenge = hexToBytes(challengeHex);
  if (challenge.length !== 16) throw new Error('bad challenge');
  const key = new Uint8Array(sha256.array(secret));
  const iv = challenge.slice(0, 12);
  const plain = new Uint8Array(pin.length);
  for (let i = 0; i < pin.length; i++) plain[i] = pin.charCodeAt(i);
  return bytesToHex(gcm(key, iv, challenge).encrypt(plain));
}
