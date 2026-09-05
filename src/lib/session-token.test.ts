import { describe, expect, it } from 'vitest';
import { deriveSessionToken } from './session-token';

describe('deriveSessionToken', () => {
  it('is deterministic for the same strong secret', async () => {
    const secret = 'a'.repeat(32);
    expect(await deriveSessionToken(secret)).toBe(await deriveSessionToken(secret));
  });

  it('changes when the secret changes', async () => {
    const left = await deriveSessionToken('a'.repeat(32));
    const right = await deriveSessionToken('b'.repeat(32));
    expect(left).not.toBe(right);
  });

  it('rejects short operator secrets', async () => {
    await expect(deriveSessionToken('too-short')).rejects.toThrow(/at least 32 characters/i);
  });
});
