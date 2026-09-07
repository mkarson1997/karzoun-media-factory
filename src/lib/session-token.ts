const SESSION_CONTEXT = 'karzoun-media-factory:session:v2';

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function deriveSessionToken(secret: string) {
  if (secret.length < 32) throw new Error('APP_SECRET must contain at least 32 characters');

  const encoder = new TextEncoder();
  const encodedSecret = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    encodedSecret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const context = encoder.encode(SESSION_CONTEXT);
  const signature = await crypto.subtle.sign('HMAC', key, context);
  return toHex(new Uint8Array(signature));
}
