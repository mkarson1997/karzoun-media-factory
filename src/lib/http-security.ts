import type { NextRequest } from 'next/server';

export function assertSameOriginMutation(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const expected = process.env.APP_BASE_URL;
  const requestOrigin = request.nextUrl.origin;
  if (origin !== requestOrigin && (!expected || origin !== new URL(expected).origin)) {
    throw new Error('Cross-origin mutation rejected');
  }
}

export function safeError(error: unknown) {
  if (error instanceof Error) {
    const safe = [
      'Prompt not found or inactive',
      'Prompt already has a production job',
      'Production job not found',
      'No enabled',
      'Invalid production job transition',
      'Cross-origin mutation rejected',
      'Daily production limit reached',
      'Daily publishing limit reached',
      'Regeneration is only available',
      'YouTube is not connected',
      'YouTube OAuth requires',
      'YouTube uploads are locked',
      'Public YouTube publishing is locked',
      'Paid video generation is locked',
      'OpenArt MCP requires'
    ].find((prefix) => error.message.startsWith(prefix));
    if (safe) return error.message;
  }
  return 'Request failed';
}
