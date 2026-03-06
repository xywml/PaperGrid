export function parseTrustedScriptOrigins(raw: string): string[] {
  const origins = new Set<string>()

  for (const entry of raw.split(',')) {
    const candidate = entry.trim()
    if (!candidate) continue

    try {
      const url = new URL(candidate)
      if (url.protocol !== 'https:') {
        console.warn(`[CSP] Ignored non-HTTPS script origin: ${candidate}`)
        continue
      }
      origins.add(url.origin)
    } catch {
      console.warn(`[CSP] Ignored invalid script origin: ${candidate}`)
    }
  }

  return Array.from(origins)
}

export function buildContentSecurityPolicy(options?: {
  rawScriptOrigins?: string
  allowUnsafeInlineScript?: boolean
}): string {
  const extraScriptOrigins = parseTrustedScriptOrigins(options?.rawScriptOrigins || '')
  const allowUnsafeInlineScript = options?.allowUnsafeInlineScript ?? true

  const scriptSrc = [
    "'self'",
    ...(allowUnsafeInlineScript ? ["'unsafe-inline'"] : []),
    ...extraScriptOrigins,
  ].join(' ')

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: https:",
    "media-src 'self' https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    "connect-src 'self' https:",
    "frame-src 'self' https:",
  ].join('; ')
}