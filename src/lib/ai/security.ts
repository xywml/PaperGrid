import { isIP } from 'node:net'

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

export class AiBaseUrlValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiBaseUrlValidationError'
  }
}

type NormalizeBaseUrlOptions = {
  allowEmpty?: boolean
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'host.docker.internal',
  'gateway.docker.internal',
])

const BLOCKED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home']

function isPrivateIpv4(ip: string) {
  const parts = ip.split('.').map((item) => Number.parseInt(item, 10))
  if (parts.length !== 4 || parts.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
    return true
  }

  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true

  return false
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase()
  if (normalized === '::1' || normalized === '::') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (/^fe[89ab]/.test(normalized)) return true

  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length)
    if (isIP(mapped) === 4) {
      return isPrivateIpv4(mapped)
    }
  }

  return false
}

function assertSafeHostname(hostname: string) {
  const normalizedHost = hostname.trim().toLowerCase()
  if (!normalizedHost) {
    throw new AiBaseUrlValidationError('Base URL 缺少主机名')
  }

  if (BLOCKED_HOSTNAMES.has(normalizedHost)) {
    throw new AiBaseUrlValidationError('Base URL 不允许本地地址')
  }

  if (BLOCKED_HOST_SUFFIXES.some((suffix) => normalizedHost.endsWith(suffix))) {
    throw new AiBaseUrlValidationError('Base URL 不允许内网域名')
  }

  const hostIpVersion = isIP(normalizedHost)
  const allowPrivateHost = process.env.AI_ALLOW_PRIVATE_BASE_URL_HOST === 'true'

  if (!allowPrivateHost && hostIpVersion === 0 && !normalizedHost.includes('.')) {
    throw new AiBaseUrlValidationError('Base URL 主机名必须是公网域名')
  }

  if (hostIpVersion === 4 && isPrivateIpv4(normalizedHost)) {
    throw new AiBaseUrlValidationError('Base URL 不允许私有网段 IPv4 地址')
  }

  if (hostIpVersion === 6 && isPrivateIpv6(normalizedHost)) {
    throw new AiBaseUrlValidationError('Base URL 不允许私有网段 IPv6 地址')
  }
}

function assertSafeProtocol(protocol: string) {
  if (protocol === 'https:') {
    return
  }

  const allowHttp = process.env.AI_ALLOW_INSECURE_HTTP_BASE_URL === 'true'
  if (allowHttp && protocol === 'http:') {
    return
  }

  throw new AiBaseUrlValidationError(
    allowHttp ? 'Base URL 仅允许 http/https 协议' : 'Base URL 仅允许 https 协议'
  )
}

export function normalizeAndValidateAiBaseUrl(
  input: string,
  options: NormalizeBaseUrlOptions = {}
) {
  const raw = input.trim()
  if (!raw) {
    return options.allowEmpty ? '' : DEFAULT_OPENAI_BASE_URL
  }

  if (raw.length > 2048) {
    throw new AiBaseUrlValidationError('Base URL 过长')
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new AiBaseUrlValidationError('Base URL 格式不合法')
  }

  if (parsed.username || parsed.password) {
    throw new AiBaseUrlValidationError('Base URL 不允许包含用户名或密码')
  }

  assertSafeProtocol(parsed.protocol.toLowerCase())
  assertSafeHostname(parsed.hostname)

  const normalizedPath = parsed.pathname.replace(/\/+$/, '')
  return `${parsed.protocol}//${parsed.host}${normalizedPath}`
}
