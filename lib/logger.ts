/**
 * Structured logger.
 * - Server: emits JSON or pretty text to stdout/stderr
 * - Client: lightweight console logs for browser diagnostics
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFormat = 'json' | 'pretty';

export interface LogContext {
  [key: string]: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_REDACT_FIELDS = ['authorization', 'cookie', 'set-cookie', 'password', 'token'];
const REDACTED_VALUE = '[REDACTED]';
const MAX_SERIALIZATION_DEPTH = 6;

interface LoggerConfig {
  appCommit: string;
  appVersion: string;
  environment: string;
  format: LogFormat;
  isClient: boolean;
  isDevelopment: boolean;
  level: LogLevel;
  redactedKeys: Set<string>;
  serviceName: string;
}

function parseLogLevel(value: string | undefined, fallback: LogLevel): LogLevel {
  switch (value?.toLowerCase()) {
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
      return value.toLowerCase() as LogLevel;
    default:
      return fallback;
  }
}

function parseLogFormat(value: string | undefined, fallback: LogFormat): LogFormat {
  switch (value?.toLowerCase()) {
    case 'json':
    case 'pretty':
      return value.toLowerCase() as LogFormat;
    default:
      return fallback;
  }
}

function parseRedactedKeys(value: string | undefined): Set<string> {
  const envKeys = (value ?? '')
    .split(',')
    .map((key) => key.trim().toLowerCase())
    .filter(Boolean);

  return new Set([...DEFAULT_REDACT_FIELDS, ...envKeys]);
}

function getConsoleWriter(level: LogLevel): (...data: unknown[]) => void {
  switch (level) {
    case 'debug':
      return console.debug;
    case 'info':
      return console.info;
    case 'warn':
      return console.warn;
    case 'error':
      return console.error;
  }
}

function serializeError(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function sanitizeUrlString(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return value;
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return value;
  }

  if (!url.username && !url.password && !url.search && !url.hash) {
    return value;
  }

  const redactedSearch = url.search ? `?${REDACTED_VALUE}` : '';
  const redactedHash = url.hash ? `#${REDACTED_VALUE}` : '';

  return `${url.protocol}//${url.host}${url.pathname}${redactedSearch}${redactedHash}`;
}

function sanitizeValue(
  value: unknown,
  redactedKeys: Set<string>,
  seen: WeakSet<object>,
  depth: number = 0
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth >= MAX_SERIALIZATION_DEPTH) {
    return '[MaxDepthReached]';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (typeof value === 'bigint' || typeof value === 'symbol') {
    return String(value);
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }

  if (typeof value === 'string') {
    return sanitizeUrlString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, redactedKeys, seen, depth + 1));
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[Circular]';
    }

    seen.add(value as object);

    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (redactedKeys.has(key.toLowerCase())) {
        output[key] = REDACTED_VALUE;
      } else {
        output[key] = sanitizeValue(nestedValue, redactedKeys, seen, depth + 1);
      }
    }

    return output;
  }

  return value;
}

class Logger {
  constructor(
    private readonly config: LoggerConfig,
    private readonly baseContext: LogContext = {}
  ) {}

  child(context: LogContext): Logger {
    return new Logger(this.config, {
      ...this.baseContext,
      ...context,
    });
  }

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    const mergedContext: LogContext = {
      ...(context || {}),
      ...(error !== undefined ? { error: serializeError(error) } : {}),
    };

    this.write('error', message, mergedContext);
  }

  performance(metric: string, value: number, context?: LogContext): void {
    this.info('Performance metric', {
      event: 'performance_metric',
      metric,
      valueMs: value,
      ...context,
    });
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.level];
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const mergedContext = {
      ...this.baseContext,
      ...(context || {}),
    };
    const sanitizedContext = sanitizeValue(
      mergedContext,
      this.config.redactedKeys,
      new WeakSet<object>()
    ) as LogContext;

    if (this.config.isClient) {
      this.writeClient(level, message, sanitizedContext);
      return;
    }

    if (this.config.format === 'pretty') {
      this.writePretty(level, message, sanitizedContext);
      return;
    }

    this.writeJson(level, message, sanitizedContext);
  }

  private writeJson(level: LogLevel, message: string, context: LogContext): void {
    const writer = getConsoleWriter(level);
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.config.serviceName,
      env: this.config.environment,
      runtime: 'server',
      appVersion: this.config.appVersion,
      appCommit: this.config.appCommit,
      pid: process.pid,
      ...context,
      message,
    };

    writer(JSON.stringify(entry));
  }

  private writePretty(level: LogLevel, message: string, context: LogContext): void {
    const writer = getConsoleWriter(level);
    const timestamp = new Date().toISOString();
    const contextJson = Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
    writer(`${timestamp} ${level.toUpperCase()} ${message}${contextJson}`);
  }

  private writeClient(level: LogLevel, message: string, context: LogContext): void {
    if (!this.config.isDevelopment && level !== 'error') {
      return;
    }

    const writer = getConsoleWriter(level);
    if (Object.keys(context).length > 0) {
      writer(`[${level.toUpperCase()}] ${message}`, context);
      return;
    }

    writer(`[${level.toUpperCase()}] ${message}`);
  }
}

const isClient = typeof window !== 'undefined';
const isDevelopment = process.env.NODE_ENV !== 'production';
const defaultLevel: LogLevel = isDevelopment ? 'debug' : 'info';
const defaultFormat: LogFormat = isDevelopment ? 'pretty' : 'json';

const loggerConfig: LoggerConfig = {
  appCommit: process.env.APP_COMMIT || 'unknown',
  appVersion: process.env.APP_VERSION || process.env.npm_package_version || 'unknown',
  environment: process.env.NODE_ENV || 'development',
  format: parseLogFormat(process.env.LOG_FORMAT, defaultFormat),
  isClient,
  isDevelopment,
  level: parseLogLevel(process.env.LOG_LEVEL, defaultLevel),
  redactedKeys: parseRedactedKeys(process.env.LOG_REDACT_FIELDS),
  serviceName: process.env.LOG_SERVICE_NAME || 'thedailyfeed',
};

export const logger = new Logger(loggerConfig);
