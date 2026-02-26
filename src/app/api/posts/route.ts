import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { PostStatus, type Prisma } from '@prisma/client'
import slugify from 'slugify'
import readingTime from 'reading-time'
import bcrypt from 'bcryptjs'

// GET /api/posts - 获取文章列表
export async function GET(req: Request) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
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

    // 构建查询条件
    const where: Prisma.PostWhereInput = {}

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

    // 管理后台只允许管理员访问

    // 查询文章总数
    const total = await prisma.post.count({ where })

    // 查询文章列表
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
      orderBy: {
        createdAt: 'desc',
      },
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
    console.error('获取文章列表失败:', error)
    return NextResponse.json(
      { error: '获取文章列表失败' },
      { status: 500 }
    )
  }
}

// POST /api/posts - 创建文章
export async function POST(req: Request) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
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
      createdAt,
      isProtected,
      password,
    } = body

    // 验证必填字段
    if (!title || !content) {
      return NextResponse.json(
        { error: '标题和内容不能为空' },
        { status: 400 }
      )
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

    const parsedCreatedAt =
      typeof createdAt === 'string' && createdAt.trim().length > 0
        ? new Date(createdAt)
        : null
    if (parsedCreatedAt && Number.isNaN(parsedCreatedAt.getTime())) {
      return NextResponse.json({ error: '创建时间格式错误' }, { status: 400 })
    }

    const protectPost = isProtected === true
    let passwordHash: string | null = null
    if (protectPost) {
      const rawPassword = typeof password === 'string' ? password.trim() : ''
      if (rawPassword.length < 4) {
        return NextResponse.json({ error: '文章密码至少 4 位' }, { status: 400 })
      }
      if (rawPassword.length > 64) {
        return NextResponse.json({ error: '文章密码过长' }, { status: 400 })
      }
      passwordHash = await bcrypt.hash(rawPassword, 10)
    }

    // 创建文章
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
        authorId: session.user.id,
        categoryId: resolvedCategoryId,
        isProtected: protectPost,
        passwordHash,
        ...(parsedCreatedAt ? { createdAt: parsedCreatedAt } : {}),
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
        content: true,
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
    console.error('创建文章失败:', error)
    return NextResponse.json({ error: '创建文章失败' }, { status: 500 })
  }
}
