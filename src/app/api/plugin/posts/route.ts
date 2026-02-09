import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PostStatus, type Prisma } from '@prisma/client'
import slugify from 'slugify'
import { requireApiKey } from '@/lib/api-keys'
import readingTime from 'reading-time'
import bcrypt from 'bcryptjs'

const ALLOWED_POST_STATUS = new Set<PostStatus>([
  PostStatus.DRAFT,
  PostStatus.PUBLISHED,
  PostStatus.ARCHIVED,
])

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const dedup = new Set<string>()
  for (const item of input) {
    if (typeof item === 'string' && item.trim().length > 0) {
      dedup.add(item.trim())
    }
  }
  return [...dedup]
}

function parseTags(input: unknown) {
  if (input === undefined) {
    return { ok: true as const, tags: [] as string[], shouldUpdate: false }
  }
  if (!Array.isArray(input)) {
    return { ok: false as const, error: 'tags 必须是字符串数组' }
  }

  const normalized = normalizeTags(input)
  if (normalized.length !== input.length) {
    return { ok: false as const, error: 'tags 中存在非法值' }
  }

  return { ok: true as const, tags: normalized, shouldUpdate: true }
}

function parseStatus(input: unknown): PostStatus | null {
  if (typeof input !== 'string') return null
  if (!ALLOWED_POST_STATUS.has(input as PostStatus)) return null
  return input as PostStatus
}

function parseBoolean(input: unknown): boolean | undefined {
  if (typeof input === 'boolean') return input
  return undefined
}

function parseOptionalString(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  return input
}

function parseNullableString(input: unknown): string | null | undefined {
  if (input === undefined) return undefined
  if (input === null) return null
  if (typeof input !== 'string') return undefined
  return input
}

function parseCategoryId(input: unknown): string | null | undefined {
  if (input === null || input === '') return null
  if (typeof input !== 'string') return undefined
  const normalized = input.trim()
  return normalized.length > 0 ? normalized : null
}

function parseCreatedAt(input: unknown): Date | null | undefined {
  if (input === undefined) return undefined
  if (input === null || input === '') return null
  if (typeof input !== 'string') return undefined
  const normalized = input.trim()
  if (!normalized) return null
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed
}

async function hashPostPasswordIfNeeded(isProtected: boolean, password: unknown) {
  const raw = typeof password === 'string' ? password.trim() : ''

  if (!isProtected) {
    if (raw.length > 0) {
      return { ok: false as const, error: '未启用加密，无法设置密码' }
    }
    return { ok: true as const, passwordHash: null as string | null }
  }

  if (raw.length < 4) {
    return { ok: false as const, error: '文章密码至少 4 位' }
  }
  if (raw.length > 64) {
    return { ok: false as const, error: '文章密码过长' }
  }

  const passwordHash = await bcrypt.hash(raw, 10)
  return { ok: true as const, passwordHash }
}

async function assertCategoryExists(categoryId: string | null | undefined) {
  if (categoryId === undefined) {
    return { ok: true as const, resolvedCategoryId: undefined as string | undefined }
  }

  if (categoryId === null) {
    const defaultCategory = await prisma.category.upsert({
      where: { slug: 'uncategorized' },
      update: { name: '未分类' },
      create: { name: '未分类', slug: 'uncategorized' },
    })
    return { ok: true as const, resolvedCategoryId: defaultCategory.id }
  }

  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } })
  if (!category) {
    return { ok: false as const, error: '分类不存在' }
  }

  return { ok: true as const, resolvedCategoryId: category.id }
}

async function assertTagsExist(tagIds: string[]) {
  if (tagIds.length === 0) {
    return { ok: true as const }
  }

  const found = await prisma.tag.findMany({
    where: { id: { in: tagIds } },
    select: { id: true },
  })

  if (found.length !== tagIds.length) {
    return { ok: false as const, error: '存在无效标签 ID' }
  }

  return { ok: true as const }
}

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
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status, headers: authResult.headers }
      )
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
    const where: Prisma.PostWhereInput = {}

    if (status && status !== 'all') {
      const parsedStatus = parseStatus(status)
      if (!parsedStatus) {
        return NextResponse.json(
          { error: '无效的文章状态' },
          { status: 400, headers: authResult.headers }
        )
      }
      where.status = parsedStatus
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

    return NextResponse.json(
      {
        posts,
        pagination: {
          total,
          page: safePage,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      { headers: authResult.headers }
    )
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
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status, headers: authResult.headers }
      )
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

    const normalizedTitle = typeof title === 'string' ? title.trim() : ''
    if (!normalizedTitle) {
      return NextResponse.json(
        { error: '标题不能为空' },
        { status: 400, headers: authResult.headers }
      )
    }

    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: '内容不能为空' },
        { status: 400, headers: authResult.headers }
      )
    }

    const parsedExcerpt = parseNullableString(excerpt)
    if (excerpt !== undefined && parsedExcerpt === undefined) {
      return NextResponse.json(
        { error: 'excerpt 类型错误' },
        { status: 400, headers: authResult.headers }
      )
    }

    const parsedCoverImage = parseNullableString(coverImage)
    if (coverImage !== undefined && parsedCoverImage === undefined) {
      return NextResponse.json(
        { error: 'coverImage 类型错误' },
        { status: 400, headers: authResult.headers }
      )
    }

    const parsedStatus = status === undefined ? PostStatus.DRAFT : parseStatus(status)
    if (!parsedStatus) {
      return NextResponse.json(
        { error: '无效的文章状态' },
        { status: 400, headers: authResult.headers }
      )
    }

    const parsedLocale = parseOptionalString(locale)
    if (locale !== undefined && parsedLocale === undefined) {
      return NextResponse.json(
        { error: 'locale 类型错误' },
        { status: 400, headers: authResult.headers }
      )
    }

    const parsedCreatedAt = parseCreatedAt(createdAt)
    if (createdAt !== undefined && parsedCreatedAt === undefined) {
      return NextResponse.json(
        { error: '创建时间格式错误' },
        { status: 400, headers: authResult.headers }
      )
    }

    const parsedIsProtected = parseBoolean(isProtected)
    if (isProtected !== undefined && parsedIsProtected === undefined) {
      return NextResponse.json(
        { error: 'isProtected 类型错误' },
        { status: 400, headers: authResult.headers }
      )
    }
    const protectPost = parsedIsProtected === true

    const passwordResult = await hashPostPasswordIfNeeded(protectPost, password)
    if (!passwordResult.ok) {
      return NextResponse.json(
        { error: passwordResult.error },
        { status: 400, headers: authResult.headers }
      )
    }

    const normalizedCategoryId = parseCategoryId(categoryId)
    if (categoryId !== undefined && normalizedCategoryId === undefined) {
      return NextResponse.json(
        { error: 'categoryId 类型错误' },
        { status: 400, headers: authResult.headers }
      )
    }

    const parsedTags = parseTags(tags)
    if (!parsedTags.ok) {
      return NextResponse.json(
        { error: parsedTags.error },
        { status: 400, headers: authResult.headers }
      )
    }

    const tagsValidation = await assertTagsExist(parsedTags.tags)
    if (!tagsValidation.ok) {
      return NextResponse.json(
        { error: tagsValidation.error },
        { status: 400, headers: authResult.headers }
      )
    }

    const baseSlug =
      slugify(normalizedTitle, { lower: true, strict: true, trim: true }) ||
      `post-${Date.now()}`
    let slug = baseSlug
    let suffix = 1
    while (await prisma.post.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix}`
      suffix += 1
    }

    const categoryValidation = await assertCategoryExists(normalizedCategoryId ?? null)
    if (!categoryValidation.ok) {
      return NextResponse.json(
        { error: categoryValidation.error },
        { status: 400, headers: authResult.headers }
      )
    }
    const resolvedCategoryId = categoryValidation.resolvedCategoryId!

    const authorId = await resolveAuthorId()

    const post = await prisma.post.create({
      data: {
        title: normalizedTitle,
        slug,
        content,
        readingTime: Math.max(1, Math.round(readingTime(content).minutes)),
        ...(parsedExcerpt !== undefined && { excerpt: parsedExcerpt }),
        ...(parsedCoverImage !== undefined && { coverImage: parsedCoverImage }),
        status: parsedStatus,
        locale: parsedLocale || 'zh',
        authorId,
        categoryId: resolvedCategoryId,
        isProtected: protectPost,
        passwordHash: passwordResult.passwordHash,
        ...(parsedCreatedAt ? { createdAt: parsedCreatedAt } : {}),
        publishedAt: parsedStatus === PostStatus.PUBLISHED ? new Date() : null,
        postTags: parsedTags.tags.length > 0
          ? {
              create: parsedTags.tags.map((tagId) => ({
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

    return NextResponse.json({ post }, { status: 201, headers: authResult.headers })
  } catch (error) {
    console.error('插件创建文章失败:', error)
    return NextResponse.json({ error: '创建文章失败' }, { status: 500 })
  }
}
