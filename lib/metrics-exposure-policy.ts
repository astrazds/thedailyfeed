export const metricsExposurePolicy = {
  mode: 'app-authenticated-operator',
  access: 'bearer-token-required-in-production',
  cacheControl: 'no-store',
  requestId: 'forwarded-or-generated',
  realm: 'thedailyfeed-metrics',
} as const;
