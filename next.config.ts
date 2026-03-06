import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import createMDX from '@next/mdx'
import { buildContentSecurityPolicy } from './src/lib/csp'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const withMDX = createMDX({
  extension: /\.mdx?$/,
})

const contentSecurityPolicy = buildContentSecurityPolicy({
  rawScriptOrigins: process.env.HEAD_INJECT_SCRIPT_ORIGINS || '',
  allowUnsafeInlineScript: process.env.CSP_ALLOW_UNSAFE_INLINE_SCRIPT !== 'false',
})

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
