export function proxyDestination(requestTarget: string, origin: string): URL {
  const requestUrl = new URL(requestTarget, 'http://runtime.test');
  const destination = new URL(origin);
  destination.pathname = requestUrl.pathname;
  destination.search = requestUrl.search;
  return destination;
}
