import { cache } from 'react'
import { prisma } from './prisma'

export const PUBLIC_POST_PAGE_REVALIDATE = 60

export async function getPublishedPostSlugs() {
  return prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
    },
    select: {
      slug: true,
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
  })
}

export const getPublishedPostBySlug = cache(async (slug: string) => {
  return prisma.post.findFirst({
    where: {
      slug,
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
  })
})

export const getPublicPostPageData = cache(async (slug: string) => {
  const post = await getPublishedPostBySlug(slug)

  if (!post) {
    return null
  }

  const relatedPostsPromise = post.category
    ? prisma.post.findMany({
        where: {
          status: 'PUBLISHED',
          categoryId: post.categoryId,
          id: {
            not: post.id,
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

  if (!post.publishedAt) {
    return {
      post,
      prevPost: null,
      nextPost: null,
      relatedPosts: await relatedPostsPromise,
    }
  }

  const [prevPost, nextPost, relatedPosts] = await Promise.all([
    prisma.post.findFirst({
      where: {
        status: 'PUBLISHED',
        publishedAt: {
          lt: post.publishedAt,
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
          gt: post.publishedAt,
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
    post,
    prevPost,
    nextPost,
    relatedPosts,
  }
})
