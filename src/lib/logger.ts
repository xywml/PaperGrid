import crypto from 'node:crypto'
import pino, { type Logger } from 'pino'

const LOG_LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])

const REDACT_PATHS = [
  'authorization',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  '*.authorization',
  '*.cookie',
  '*.password',
  '*.token',
  '*.apiKey',
  '*.secret',
  '*.smtpPass',
]

function resolveLogLevel() {
  const raw =
    (process.env.LOG_LEVEL || '').trim().toLowerCase() ||
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

  return LOG_LEVELS.has(raw) ? raw : 'info'
}

export const logger: Logger = pino({
  level: resolveLogLevel(),
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: REDACT_PATHS,
    remove: true,
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
})

const REQUEST_ID_HEADERS = ['x-request-id', 'x-correlation-id', 'x-trace-id']

export function resolveRequestId(request: Request): string {
  for (const name of REQUEST_ID_HEADERS) {
    const value = request.headers.get(name)
    if (value && value.trim()) {
      return value.trim()
    }
  }
  return crypto.randomUUID()
}

export function createRequestLogger(
  request: Request,
  bindings: Record<string, unknown> = {}
): Logger {
  return logger.child({
    requestId: resolveRequestId(request),
    method: request.method,
    route: new URL(request.url).pathname,
    ...bindings,
  })
}
