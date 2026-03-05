const DEFAULT_SITE_URL = 'http://localhost:6066'

function toAbsoluteUrl(value: string): URL | null {
  const input = value.trim()
  if (!input) return null

  try {
    return new URL(input)
  } catch {
    // Fallback for domain-only values like example.com.
    try {
      return new URL(`https://${input}`)
    } catch {
      return null
    }
  }
}

function isAllowedSiteProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:'
}

export function getSiteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || DEFAULT_SITE_URL
  const parsed = toAbsoluteUrl(raw)

  if (!parsed || !isAllowedSiteProtocol(parsed.protocol)) {
    return new URL(DEFAULT_SITE_URL)
  }

  // Always normalize to origin-level base URL to avoid path-based metadata base issues.
  return new URL(parsed.origin)
}

export function getConfiguredSiteUrl(): URL | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || ''
  const parsed = toAbsoluteUrl(raw)
  if (!parsed || !isAllowedSiteProtocol(parsed.protocol)) return null
  return new URL(parsed.origin)
}

export function toCanonicalPath(pathname: string, searchParams?: Record<string, string | undefined>): string {
  const basePath = pathname.startsWith('/') ? pathname : `/${pathname}`
  const normalizedPath = basePath === '' ? '/' : basePath
  if (!searchParams || Object.keys(searchParams).length === 0) {
    return normalizedPath
  }

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) query.set(key, value)
  }

  const serialized = query.toString()
  return serialized ? `${normalizedPath}?${serialized}` : normalizedPath
}
