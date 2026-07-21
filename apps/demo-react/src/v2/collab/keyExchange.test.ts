import { describe, it, expect } from 'vitest';
import { generateEcdhPair, deriveSharedKey, wrapRoomKey, unwrapRoomKey } from './keyExchange.js';

describe('host-gated ECDH key exchange', () => {
  it('host and the intended joiner derive the SAME key and the room key is delivered', async () => {
    const host = await generateEcdhPair();
    const joiner = await generateEcdhPair();
    const roomKey = 'super-secret-room-key-base64url';

    // Host wraps the room key for this joiner; joiner unwraps it.
    const hostShared = await deriveSharedKey(host.privateKey, joiner.publicKey);
    const wrapped = await wrapRoomKey(hostShared, roomKey);
    const joinerShared = await deriveSharedKey(joiner.privateKey, host.publicKey);
    expect(await unwrapRoomKey(joinerShared, wrapped)).toBe(roomKey);
  });

  it('a forwarded peer (different keypair) CANNOT unwrap the room key', async () => {
    const host = await generateEcdhPair();
    const joiner = await generateEcdhPair();   // the invited person
    const attacker = await generateEcdhPair();  // got the link forwarded
    const roomKey = 'super-secret-room-key-base64url';

    // Host grants to the invited joiner.
    const wrapped = await wrapRoomKey(await deriveSharedKey(host.privateKey, joiner.publicKey), roomKey);
    // The attacker tries to unwrap with ITS keypair against the host's public key.
    const attackerShared = await deriveSharedKey(attacker.privateKey, host.publicKey);
    await expect(unwrapRoomKey(attackerShared, wrapped)).rejects.toBeTruthy();
  });

  it('each pair derives a distinct secret (no key reuse across joiners)', async () => {
    const host = await generateEcdhPair();
    const a = await generateEcdhPair();
    const b = await generateEcdhPair();
    const key = 'k';
    const wrapA = await wrapRoomKey(await deriveSharedKey(host.privateKey, a.publicKey), key);
    // B's shared secret must not unwrap A's grant.
    await expect(unwrapRoomKey(await deriveSharedKey(b.privateKey, host.publicKey), wrapA)).rejects.toBeTruthy();
  });
});
