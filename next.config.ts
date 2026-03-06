import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import createMDX from '@next/mdx'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const withMDX = createMDX({
  extension: /\.mdx?$/,
})

function parseTrustedScriptOrigins(raw: string): string[] {
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

// Origins injected via admin "custom head code" setting.
// Parsed at build/start time from env so that CSP stays in sync.
const extraScriptOrigins = parseTrustedScriptOrigins(process.env.HEAD_INJECT_SCRIPT_ORIGINS || '')
const allowUnsafeInlineScript = process.env.CSP_ALLOW_UNSAFE_INLINE_SCRIPT !== 'false'

const scriptSrc = [
  "'self'",
  ...(allowUnsafeInlineScript ? ["'unsafe-inline'"] : []),
  ...extraScriptOrigins,
].join(' ')

const contentSecurityPolicy = [
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

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: [
    'sqlite-vec',
    'sqlite-vec-linux-x64',
    'sqlite-vec-linux-arm64',
    'sqlite-vec-darwin-x64',
    'sqlite-vec-darwin-arm64',
    'sqlite-vec-windows-x64',
  ],
  // Append the default value of mdx in webpack extensions
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default withNextIntl(withMDX(nextConfig))
