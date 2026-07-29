export function calculateRetryDelayMs(input: {
  attemptCount: number;
  baseDelayMs: number;
  maximumDelayMs: number;
}): number {
  const exponent = Math.max(input.attemptCount - 1, 0);
  const delay = input.baseDelayMs * 2 ** exponent;

  return Math.min(delay, input.maximumDelayMs);
}
