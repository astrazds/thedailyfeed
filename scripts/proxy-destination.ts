export function proxyDestination(requestTarget: string, origin: string): URL {
  return new URL(requestTarget, origin);
}
