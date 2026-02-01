import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PostStatus } from '@prisma/client'
import slugify from 'slugify'
import { requireApiKey } from '@/lib/api-keys'
import readingTime from 'reading-time'

async function resolveAuthorId() {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true },
  })

  if (!admin) {
    throw new Error('缺少管理员用户')
  }

  return admin.id
}

// GET /api/plugin/posts - 获取文章列表 (API Key)
export async function GET(req: Request) {
  try {
    const authResult = await requireApiKey(req, 'POST_READ')
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const rawLimit = parseInt(searchParams.get('limit') || '10')
    const limit = Math.min(Math.max(rawLimit, 1), 50)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const categoryId = searchParams.get('categoryId')

    const safePage = Number.isFinite(page) && page > 0 ? page : 1
    const skip = (safePage - 1) * limit
    const where: any = {}

    if (status && status !== 'all') {
      where.status = status as PostStatus
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { excerpt: { contains: search } },
      ]
    }

    if (categoryId) {
      where.categoryId = categoryId
    }

    const total = await prisma.post.count({ where })
    const posts = await prisma.post.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        coverImage: true,
        status: true,
        locale: true,
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
        readingTime: true,
        isProtected: true,
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        category: true,
        postTags: {
          include: {
            tag: true,
          },
        },
        _count: {
          select: {
            comments: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    })

    return NextResponse.json({
      posts,
      pagination: {
        total,
        page: safePage,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('插件获取文章列表失败:', error)
    return NextResponse.json({ error: '获取文章列表失败' }, { status: 500 })
  }
}

// POST /api/plugin/posts - 创建文章 (API Key)
export async function POST(req: Request) {
  try {
    const authResult = await requireApiKey(req, 'POST_CREATE')
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const body = await req.json()
    const {
      title,
      content,
      excerpt,
      coverImage,
      status,
      locale,
      categoryId,
      tags,
    } = body

    if (!title || !content) {
      return NextResponse.json({ error: '标题和内容不能为空' }, { status: 400 })
    }

    const baseSlug =
      slugify(String(title), { lower: true, strict: true, trim: true }) ||
      `post-${Date.now()}`
    let slug = baseSlug
    let suffix = 1
    while (await prisma.post.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix}`
      suffix += 1
    }

    const normalizedCategoryId =
      typeof categoryId === 'string' && categoryId.trim().length > 0
        ? categoryId
        : null

    let resolvedCategoryId = normalizedCategoryId
    if (!resolvedCategoryId) {
      const defaultCategory = await prisma.category.upsert({
        where: { slug: 'uncategorized' },
        update: { name: '未分类' },
        create: { name: '未分类', slug: 'uncategorized' },
      })
      resolvedCategoryId = defaultCategory.id
    }

    const authorId = await resolveAuthorId()

    const post = await prisma.post.create({
      data: {
        title,
        slug,
        content,
        readingTime: Math.max(1, Math.round(readingTime(String(content)).minutes)),
        excerpt,
        coverImage,
        status: status || PostStatus.DRAFT,
        locale: locale || 'zh',
        authorId,
        categoryId: resolvedCategoryId,
        publishedAt: status === PostStatus.PUBLISHED ? new Date() : null,
        postTags: tags
          ? {
              create: tags.map((tagId: string) => ({
                tagId,
              })),
            }
          : undefined,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        coverImage: true,
        status: true,
        locale: true,
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
        readingTime: true,
        isProtected: true,
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        category: true,
        postTags: {
          include: {
            tag: true,
          },
        },
      },
    })

    return NextResponse.json({ post }, { status: 201 })
  } catch (error) {
    console.error('插件创建文章失败:', error)
    return NextResponse.json({ error: '创建文章失败' }, { status: 500 })
  }
}
