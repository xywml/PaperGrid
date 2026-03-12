import { unstable_cache } from 'next/cache'
import { prisma } from './prisma'

export const POSTS_CONTENT_CACHE_TAG = 'posts:content'
export const POSTS_LIST_CACHE_TAG = 'posts:list'
export const POSTS_ORDER_CACHE_TAG = 'posts:order'

function normalizeSlug(slug: string | null | undefined) {
  return typeof slug === 'string' ? slug.trim() : ''
}

export function getPostCacheTag(slug: string) {
  return `post:${normalizeSlug(slug)}`
}

export function getCategoryRelatedCacheTag(slug: string) {
  return `category:${normalizeSlug(slug)}:related`
}

export async function getPublishedPostSlugs() {
  return unstable_cache(
    async () =>
      prisma.post.findMany({
        where: {
          status: 'PUBLISHED',
        },
        select: {
          slug: true,
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      }),
    ['published-post-slugs'],
    {
      tags: [POSTS_CONTENT_CACHE_TAG, POSTS_LIST_CACHE_TAG],
      revalidate: false,
    }
  )()
}

export async function getPublishedPostBySlug(slug: string) {
  const normalizedSlug = normalizeSlug(slug)
  if (!normalizedSlug) {
    return null
  }

  return unstable_cache(
    async () =>
      prisma.post.findFirst({
        where: {
          slug: normalizedSlug,
          status: 'PUBLISHED',
        },
        select: {
          id: true,
          title: true,
          slug: true,
          content: true,
          excerpt: true,
          coverImage: true,
          status: true,
          publishedAt: true,
          updatedAt: true,
          readingTime: true,
          categoryId: true,
          isProtected: true,
          author: {
            select: {
              name: true,
              image: true,
            },
          },
          category: {
            select: {
              name: true,
              slug: true,
            },
          },
          postTags: {
            select: {
              tag: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
          viewCount: {
            select: {
              count: true,
            },
          },
        },
      }),
    ['published-post-by-slug', normalizedSlug],
    {
      tags: [POSTS_CONTENT_CACHE_TAG, getPostCacheTag(normalizedSlug)],
      revalidate: false,
    }
  )()
}

async function getPostRelations(
  postId: string,
  publishedAtIso: string | null,
  categoryId: string | null,
  categorySlug: string | null
) {
  const normalizedCategorySlug = normalizeSlug(categorySlug)
  const tags = [POSTS_CONTENT_CACHE_TAG, POSTS_ORDER_CACHE_TAG]
  if (normalizedCategorySlug) {
    tags.push(getCategoryRelatedCacheTag(normalizedCategorySlug))
  }

  return unstable_cache(
    async () => {
      const relatedPostsPromise = categoryId
        ? prisma.post.findMany({
            where: {
              status: 'PUBLISHED',
              categoryId,
              id: {
                not: postId,
              },
            },
            take: 4,
            orderBy: {
              publishedAt: 'desc',
            },
            select: {
              id: true,
              title: true,
              slug: true,
              excerpt: true,
              coverImage: true,
              publishedAt: true,
              isProtected: true,
              viewCount: {
                select: { count: true },
              },
            },
          })
        : Promise.resolve([])

      if (!publishedAtIso) {
        return {
          prevPost: null,
          nextPost: null,
          relatedPosts: await relatedPostsPromise,
        }
      }

      const publishedAt = new Date(publishedAtIso)

      const [prevPost, nextPost, relatedPosts] = await Promise.all([
        prisma.post.findFirst({
          where: {
            status: 'PUBLISHED',
            publishedAt: {
              lt: publishedAt,
            },
          },
          orderBy: {
            publishedAt: 'desc',
          },
          select: {
            id: true,
            title: true,
            slug: true,
          },
        }),
        prisma.post.findFirst({
          where: {
            status: 'PUBLISHED',
            publishedAt: {
              gt: publishedAt,
            },
          },
          orderBy: {
            publishedAt: 'asc',
          },
          select: {
            id: true,
            title: true,
            slug: true,
          },
        }),
        relatedPostsPromise,
      ])

      return {
        prevPost,
        nextPost,
        relatedPosts,
      }
    },
    [
      'post-relations',
      postId,
      publishedAtIso ?? '',
      categoryId ?? '',
      normalizedCategorySlug,
    ],
    {
      tags,
      revalidate: false,
    }
  )()
}

export async function getPublicPostPageData(slug: string) {
  const post = await getPublishedPostBySlug(slug)

  if (!post) {
    return null
  }

  // TODO: 后续将 unstable_cache 边界统一为显式 DTO。
  // 计划:
  // 1. 在缓存函数内统一把 Date 字段序列化为 ISO 字符串。
  // 2. 为缓存返回值补充独立类型，避免页面层依赖 Prisma/Date 运行时形态。
  // 3. 将页面层日期消费收口到统一解析 helper，兼容 string / Date 两种输入。
  const relations = await getPostRelations(
    post.id,
    post.publishedAt ? new Date(post.publishedAt).toISOString() : null,
    post.categoryId,
    post.category?.slug ?? null
  )

  return {
    post,
    ...relations,
  }
}
