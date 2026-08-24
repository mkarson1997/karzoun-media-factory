export function zeroCostMode(env: NodeJS.ProcessEnv = process.env) {
  return env.ZERO_COST_MODE === 'true';
}

export function effectiveVideoProvider(requested = process.env.VIDEO_PROVIDER || 'mock', env: NodeJS.ProcessEnv = process.env) {
  return zeroCostMode(env) ? 'local-demo' : requested;
}

export function assertExternalCreativeAllowed(provider: string, env: NodeJS.ProcessEnv = process.env) {
  if (zeroCostMode(env) && ['openai', 'groq', 'anthropic'].includes(provider)) {
    throw new Error(`ZERO_COST_MODE blocks the ${provider} API at runtime`);
  }
}

export function assertPaidGenerationAllowed(provider: string, env: NodeJS.ProcessEnv = process.env) {
  if (zeroCostMode(env) && provider !== 'local-demo') {
    throw new Error(`ZERO_COST_MODE blocks paid generation provider ${provider}`);
  }
  if (provider === 'openart-mcp' && env.ALLOW_PAID_GENERATION !== 'true') {
    throw new Error('Paid generation is locked');
  }
}
