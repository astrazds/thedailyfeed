import { FEED_OVERALL_TIMEOUT_MS } from './constants';

export function createFeedOperationSignal(
  requestSignal: AbortSignal,
  timeoutMs: number = FEED_OVERALL_TIMEOUT_MS
): AbortSignal {
  return AbortSignal.any([requestSignal, AbortSignal.timeout(timeoutMs)]);
}
