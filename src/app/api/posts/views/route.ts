import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'

const VIEW_READ_LIMIT = {
  windowMs: 5 * 60 * 1000,
  max: 240,
}

function parseSlug(input: string | null | undefined) {
  const slug = typeof input === 'string' ? input.trim() : ''
  if (!slug || slug.length > 200) {
    return ''
  }
  return slug
}

function parseSlugList(input: string | null | undefined) {
  const raw = typeof input === 'string' ? input : ''
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((item) => parseSlug(item))
        .filter(Boolean)
    )
  ).slice(0, 20)
}

function jsonWithHeaders(
  body: unknown,
  init?: {
    status?: number
    headers?: HeadersInit
  }
) {
  const res = NextResponse.json(body, {
    status: init?.status,
    headers: init?.headers,
  })
  res.headers.set('Cache-Control', 'no-store, max-age=0')
  return res
}

// GET /api/posts/views?slug=xxx
// GET /api/posts/views?slugs=slug-a,slug-b
export async function GET(request: NextRequest) {
  try {
    const clientIp = getClientIp(request)
    const limit = rateLimit(`view-read:${clientIp}`, VIEW_READ_LIMIT)

    if (!limit.ok) {
      return jsonWithHeaders(
        { error: '请求过于频繁' },
        { status: 429, headers: rateLimitHeaders(limit) }
      )
    }

    const { searchParams } = new URL(request.url)
    const slug = parseSlug(searchParams.get('slug'))

    if (slug) {
      const post = await prisma.post.findFirst({
        where: {
          slug,
          status: 'PUBLISHED',
        },
        select: {
          viewCount: {
            select: {
              count: true,
            },
          },
        },
      })

      if (!post) {
        return jsonWithHeaders(
          { error: '文章不存在' },
          { status: 404, headers: rateLimitHeaders(limit) }
        )
      }

      return jsonWithHeaders(
        { count: post.viewCount?.count || 0 },
        { headers: rateLimitHeaders(limit) }
      )
    }

    const slugs = parseSlugList(searchParams.get('slugs'))
    if (slugs.length === 0) {
      return jsonWithHeaders(
        { error: '参数错误' },
        { status: 400, headers: rateLimitHeaders(limit) }
      )
    }

    const posts = await prisma.post.findMany({
      where: {
        slug: { in: slugs },
        status: 'PUBLISHED',
      },
      select: {
        slug: true,
        viewCount: {
          select: {
            count: true,
          },
        },
      },
    })

    const counts: Record<string, number> = Object.fromEntries(slugs.map((item) => [item, 0]))
    for (const post of posts) {
      counts[post.slug] = post.viewCount?.count || 0
    }

    return jsonWithHeaders(
      { counts },
      { headers: rateLimitHeaders(limit) }
    )
  } catch (error) {
    console.error('获取阅读量失败:', error)
    return jsonWithHeaders({ error: '获取阅读量失败' }, { status: 500 })
  }
}

// POST /api/posts/views  { slug }
// 轻量计数：用于博客阅读量统计，避免阻塞文章页面渲染与缓存。
export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request)
    const limit = rateLimit(`view:${clientIp}`, {
      windowMs: 5 * 60 * 1000,
      max: 30,
    })

    if (!limit.ok) {
      return NextResponse.json(
        { error: '请求过于频繁' },
        { status: 429, headers: rateLimitHeaders(limit) }
      )
    }

    const body = await request.json().catch(() => null)
    const slug = parseSlug(body?.slug)

    if (!slug) {
      return NextResponse.json(
        { error: '参数错误' },
        { status: 400, headers: rateLimitHeaders(limit) }
      )
    }

    const post = await prisma.post.findFirst({
      where: {
        slug,
        status: 'PUBLISHED',
      },
      select: { id: true },
    })

    if (!post) {
      return NextResponse.json(
        { error: '文章不存在' },
        { status: 404, headers: rateLimitHeaders(limit) }
      )
    }

    const now = new Date()
    const dayStartUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    )

    const [, viewCount] = await prisma.$transaction([
      prisma.dailyView.upsert({
        where: {
          date_postId: {
            date: dayStartUtc,
            postId: post.id,
          },
        },
        create: {
          postId: post.id,
          date: dayStartUtc,
          views: 1,
        },
        update: {
          views: { increment: 1 },
        },
      }),
      prisma.viewCount.upsert({
        where: { postId: post.id },
        create: { postId: post.id, count: 1 },
        update: { count: { increment: 1 } },
        select: { count: true },
      }),
    ])

    return NextResponse.json(
      { count: viewCount.count },
      { headers: rateLimitHeaders(limit) }
    )
  } catch (error) {
    console.error('更新阅读量失败:', error)
    return NextResponse.json({ error: '更新阅读量失败' }, { status: 500 })
  }
}
