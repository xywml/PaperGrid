import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { getConfiguredSiteUrl } from '@/lib/seo'
import { unstable_cache } from 'next/cache'

export const revalidate = 3600

const MAX_URLS_PER_SITEMAP = 50000

const STATIC_ROUTES: Array<{
  path: string
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>
  priority: number
}> = [
  {
    path: '/',
    changeFrequency: 'daily',
    priority: 1,
  },
  {
    path: '/posts',
    changeFrequency: 'daily',
    priority: 0.9,
  },
  {
    path: '/categories',
    changeFrequency: 'weekly',
    priority: 0.8,
  },
  {
    path: '/tags',
    changeFrequency: 'weekly',
    priority: 0.8,
  },
  {
    path: '/archive',
    changeFrequency: 'weekly',
    priority: 0.7,
  },
  {
    path: '/about',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    path: '/yaji',
    changeFrequency: 'weekly',
    priority: 0.7,
  },
]

async function getSitemapCounts() {
  const [postsCount, categoriesCount, tagsCount] = await Promise.all([
    prisma.post.count({
      where: {
        status: 'PUBLISHED',
        isProtected: false,
      },
    }),
    prisma.category.count({
      where: {
        posts: {
          some: {
            status: 'PUBLISHED',
            isProtected: false,
          },
        },
      },
    }),
    prisma.tag.count({
      where: {
        posts: {
          some: {
            post: {
              status: 'PUBLISHED',
              isProtected: false,
            },
          },
        },
      },
    }),
  ])

  return {
    staticCount: STATIC_ROUTES.length,
    postsCount,
    categoriesCount,
    tagsCount,
  }
}

const getSitemapCountsCached = unstable_cache(getSitemapCounts, ['sitemap-counts'], {
  revalidate,
})

export async function generateSitemaps() {
  const counts = await getSitemapCountsCached()
  const totalCount = counts.staticCount + counts.postsCount + counts.categoriesCount + counts.tagsCount
  const totalSitemaps = Math.max(1, Math.ceil(totalCount / MAX_URLS_PER_SITEMAP))

  return Array.from({ length: totalSitemaps }, (_, id) => ({ id }))
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const counts = await getSitemapCountsCached()
  const totalCount = counts.staticCount + counts.postsCount + counts.categoriesCount + counts.tagsCount
  const totalSitemaps = Math.max(1, Math.ceil(totalCount / MAX_URLS_PER_SITEMAP))

  if (!Number.isInteger(id) || id < 0 || id >= totalSitemaps) {
    return []
  }

  const configuredSiteUrl = getConfiguredSiteUrl()
  const toUrl = (path: string) => (configuredSiteUrl ? `${configuredSiteUrl.origin}${path}` : path)
  const start = id * MAX_URLS_PER_SITEMAP
  const end = Math.min(start + MAX_URLS_PER_SITEMAP, totalCount)

  const routes: MetadataRoute.Sitemap = []

  if (start < counts.staticCount) {
    const staticStart = start
    const staticEnd = Math.min(end, counts.staticCount)
    for (const route of STATIC_ROUTES.slice(staticStart, staticEnd)) {
      routes.push({
          url: toUrl(route.path),
        changeFrequency: route.changeFrequency,
        priority: route.priority,
      })
    }
  }

  const dynamicStart = Math.max(0, start - counts.staticCount)
  const dynamicEnd = Math.max(0, end - counts.staticCount)

  let cursor = 0
  const postRangeStart = cursor
  const postRangeEnd = cursor + counts.postsCount
  const postStart = Math.max(dynamicStart, postRangeStart)
  const postEnd = Math.min(dynamicEnd, postRangeEnd)
  if (postEnd > postStart) {
    const posts = await prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
        isProtected: false,
      },
      select: {
        slug: true,
        updatedAt: true,
        publishedAt: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      skip: postStart - postRangeStart,
      take: postEnd - postStart,
    })

    routes.push(
      ...posts.map((post) => ({
          url: toUrl(`/posts/${post.slug}`),
        lastModified: post.updatedAt || post.publishedAt || undefined,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }))
    )
  }
  cursor = postRangeEnd

  const categoryRangeStart = cursor
  const categoryRangeEnd = cursor + counts.categoriesCount
  const categoryStart = Math.max(dynamicStart, categoryRangeStart)
  const categoryEnd = Math.min(dynamicEnd, categoryRangeEnd)
  if (categoryEnd > categoryStart) {
    const categories = await prisma.category.findMany({
      where: {
        posts: {
          some: {
            status: 'PUBLISHED',
            isProtected: false,
          },
        },
      },
      select: {
        slug: true,
        updatedAt: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: categoryStart - categoryRangeStart,
      take: categoryEnd - categoryStart,
    })

    routes.push(
      ...categories.map((category) => ({
          url: toUrl(`/categories/${category.slug}`),
        lastModified: category.updatedAt || undefined,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }))
    )
  }
  cursor = categoryRangeEnd

  const tagRangeStart = cursor
  const tagRangeEnd = cursor + counts.tagsCount
  const tagStart = Math.max(dynamicStart, tagRangeStart)
  const tagEnd = Math.min(dynamicEnd, tagRangeEnd)
  if (tagEnd > tagStart) {
    const tags = await prisma.tag.findMany({
      where: {
        posts: {
          some: {
            post: {
              status: 'PUBLISHED',
              isProtected: false,
            },
          },
        },
      },
      select: {
        slug: true,
        updatedAt: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: tagStart - tagRangeStart,
      take: tagEnd - tagStart,
    })

    routes.push(
      ...tags.map((tag) => ({
          url: toUrl(`/tags/${tag.slug}`),
        lastModified: tag.updatedAt || undefined,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }))
    )
  }

  return routes
}
