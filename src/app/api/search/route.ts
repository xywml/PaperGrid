import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  try {
    const limitResult = rateLimit(`search:${getClientIp(request)}`, {
      windowMs: 60 * 1000,
      max: 30,
    })
    if (!limitResult.ok) {
      return NextResponse.json(
        { error: '请求过于频繁' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')

    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        results: [],
        message: '搜索关键词至少需要2个字符',
      })
    }

    const trimmed = query.trim()
    if (trimmed.length > 60) {
      return NextResponse.json(
        { error: '搜索关键词过长' },
        { status: 400, headers: rateLimitHeaders(limitResult) }
      )
    }

    const searchTerm = trimmed.toLowerCase()

    // 搜索文章
    const titleMatch = { title: { contains: searchTerm } }
    const excerptMatch = { excerpt: { contains: searchTerm } }
    const contentMatch = { content: { contains: searchTerm } }
    const tagMatch = { postTags: { some: { tag: { name: { contains: searchTerm } } } } }

    const posts = await prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [
          {
            isProtected: false,
            OR: [titleMatch, excerptMatch, contentMatch, tagMatch],
          },
          {
            isProtected: true,
            OR: [titleMatch, excerptMatch, tagMatch],
          },
        ],
      },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        isProtected: true,
        publishedAt: true,
        author: {
          select: {
            name: true,
          },
        },
        category: {
          select: {
            name: true,
            slug: true,
          },
        },
        postTags: {
          take: 5,
          select: {
            tag: {
              select: {
                name: true,
                slug: true,
              },
            },
          },
        },
      },
      take: 20,
      orderBy: {
        publishedAt: 'desc',
      },
    })

    // 搜索分类
    const categories = await prisma.category.findMany({
      where: {
        OR: [
          {
            name: {
              contains: searchTerm,
            },
          },
          {
            description: {
              contains: searchTerm,
            },
          },
        ],
      },
      include: {
        _count: {
          select: {
            posts: {
              where: {
                status: 'PUBLISHED',
              },
            },
          },
        },
      },
      take: 5,
    })

    // 搜索标签
    const tags = await prisma.tag.findMany({
      where: {
        name: {
          contains: searchTerm,
        },
      },
      include: {
        _count: {
          select: {
            posts: {
              where: {
                post: {
                  status: 'PUBLISHED',
                },
              },
            },
          },
        },
      },
      take: 10,
    })

    // 格式化结果
    const results = {
      posts: posts.map((post) => ({
        id: post.id,
        type: 'post' as const,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        isProtected: post.isProtected,
        category: post.category?.name || null,
        categorySlug: post.category?.slug || null,
        tags: post.postTags.map((pt) => pt.tag.name),
        author: post.author.name,
        publishedAt: post.publishedAt,
        url: `/posts/${post.slug}`,
      })),
      categories: categories.map((cat) => ({
        id: cat.id,
        type: 'category' as const,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        postCount: cat._count.posts,
        url: `/posts?category=${cat.slug}`,
      })),
      tags: tags.map((tag) => ({
        id: tag.id,
        type: 'tag' as const,
        name: tag.name,
        slug: tag.slug,
        postCount: tag._count.posts,
        url: `/posts?tag=${tag.slug}`,
      })),
    }

    return NextResponse.json(
      {
      query,
      results,
      stats: {
        total: results.posts.length + results.categories.length + results.tags.length,
        postsCount: results.posts.length,
        categoriesCount: results.categories.length,
        tagsCount: results.tags.length,
      },
      },
      {
        headers: {
          ...rateLimitHeaders(limitResult),
          'Cache-Control': 'public, max-age=30',
        },
      }
    )
  } catch (error) {
    console.error('搜索错误:', error)
    return NextResponse.json(
      {
        error: '搜索失败',
        message: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    )
  }
}
