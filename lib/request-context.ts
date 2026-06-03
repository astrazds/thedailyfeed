export const REQUEST_ID_HEADER = 'X-Request-Id';
export const REQUEST_ID_HEADER_NAME = 'x-request-id';
export const CORRELATION_ID_HEADER_NAME = 'x-correlation-id';
export const MAX_REQUEST_ID_LENGTH = 128;

const UNKNOWN_CLIENT_IDENTITY = 'unknown';
const FORWARDED_FOR_HEADER_NAME = 'x-forwarded-for';
const REAL_IP_HEADER_NAME = 'x-real-ip';

export const DEFAULT_TRUSTED_CLIENT_IDENTITY_HEADERS = [
  FORWARDED_FOR_HEADER_NAME,
  REAL_IP_HEADER_NAME,
] as const;

export type ClientIdentitySource = 'trusted-header' | 'untrusted';

export interface ClientIdentity {
  value: string;
  source: ClientIdentitySource;
  headerName?: string;
}

export interface RequestContext {
  requestId: string;
  clientIdentity: ClientIdentity;
}

export interface RequestContextPolicy {
  trustedClientIdentityHeaders: readonly string[];
  generateRequestId?: () => string;
}

export const defaultRequestContextPolicy = {
  trustedClientIdentityHeaders: [],
} satisfies RequestContextPolicy;

function defaultGenerateRequestId(): string {
  return crypto.randomUUID();
}

function normalizeHeaderName(headerName: string): string {
  return headerName.trim().toLowerCase();
}

function firstForwardedForIdentity(headerValue: string): string {
  return headerValue.split(',')[0]?.trim() || '';
}

function readTrustedClientIdentity(headers: Headers, headerName: string): string {
  const rawValue = headers.get(headerName)?.trim() || '';
  if (!rawValue) {
    return '';
  }

  if (headerName === FORWARDED_FOR_HEADER_NAME) {
    return firstForwardedForIdentity(rawValue);
  }

  return rawValue;
}

export function deriveRequestId(
  headers: Headers,
  generateRequestId: () => string = defaultGenerateRequestId
): string {
  const forwardedId =
    headers.get(REQUEST_ID_HEADER_NAME)?.trim() ||
    headers.get(CORRELATION_ID_HEADER_NAME)?.trim();

  if (forwardedId && forwardedId.length <= MAX_REQUEST_ID_LENGTH) {
    return forwardedId;
  }

  return generateRequestId();
}

export function deriveClientIdentity(
  headers: Headers,
  trustedClientIdentityHeaders: readonly string[] = defaultRequestContextPolicy.trustedClientIdentityHeaders
): ClientIdentity {
  for (const rawHeaderName of trustedClientIdentityHeaders) {
    const headerName = normalizeHeaderName(rawHeaderName);
    const value = readTrustedClientIdentity(headers, headerName);

    if (value) {
      return {
        value,
        source: 'trusted-header',
        headerName,
      };
    }
  }

  return {
    value: UNKNOWN_CLIENT_IDENTITY,
    source: 'untrusted',
  };
}

export function deriveRequestContext(
  request: Request,
  policy: RequestContextPolicy = defaultRequestContextPolicy
): RequestContext {
  return {
    requestId: deriveRequestId(request.headers, policy.generateRequestId),
    clientIdentity: deriveClientIdentity(request.headers, policy.trustedClientIdentityHeaders),
  };
}

export function applyRequestIdHeader<T extends Response>(response: T, requestId: string): T {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}
