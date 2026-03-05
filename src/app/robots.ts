import type { MetadataRoute } from 'next'
import { getConfiguredSiteUrl } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  const configuredSiteUrl = getConfiguredSiteUrl()

  const base: MetadataRoute.Robots = {
    rules: {
      userAgent: '*',
      allow: ['/'],
      disallow: ['/admin', '/auth/signin', '/auth/signup', '/api/admin', '/api/auth'],
    },
  }

  if (!configuredSiteUrl) {
    // Degrade gracefully when site URL is not configured.
    return base
  }

  return {
    ...base,
    // `generateSitemaps` emits segmented files like /sitemap/0.xml.
    sitemap: `${configuredSiteUrl.origin}/sitemap/0.xml`,
    host: configuredSiteUrl.origin,
  }
}
