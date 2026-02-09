import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PostStatus } from '@prisma/client'
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

function parseStatus(input: unknown): PostStatus | undefined {
  if (typeof input !== 'string') return undefined
  if (!ALLOWED_POST_STATUS.has(input as PostStatus)) return undefined
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

async function assertCategoryExists(categoryId: string | null | undefined) {
  if (categoryId === undefined) {
    return { ok: true as const, resolvedCategoryId: undefined as string | null | undefined }
  }

  if (categoryId === null) {
    return { ok: true as const, resolvedCategoryId: null }
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

// GET /api/plugin/posts/[id] - 获取单个文章 (API Key)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiKey(req, 'POST_READ')
    if (!authResult.ok) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status, headers: authResult.headers }
      )
    }

    const { id } = await params

    const post = await prisma.post.findUnique({
      where: { id },
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
        comments: {
          where: { status: 'APPROVED' },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!post) {
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }

    return NextResponse.json({ post }, { headers: authResult.headers })
  } catch (error) {
    console.error('插件获取文章失败:', error)
    return NextResponse.json({ error: '获取文章失败' }, { status: 500 })
  }
}

// PATCH /api/plugin/posts/[id] - 更新文章 (API Key)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiKey(req, 'POST_UPDATE')
    if (!authResult.ok) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status, headers: authResult.headers }
      )
    }

    const { id } = await params

    const existingPost = await prisma.post.findUnique({ where: { id } })
    if (!existingPost) {
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
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

    if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
      return NextResponse.json(
        { error: '标题不能为空' },
        { status: 400, headers: authResult.headers }
      )
    }

    if (content !== undefined && (typeof content !== 'string' || content.trim().length === 0)) {
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

    const parsedStatus = status === undefined ? undefined : parseStatus(status)
    if (status !== undefined && parsedStatus === undefined) {
      return NextResponse.json(
        { error: '无效的文章状态' },
        { status: 400, headers: authResult.headers }
      )
    }

    const parsedLocale = locale === undefined ? undefined : parseOptionalString(locale)
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

    const normalizedCategoryId = parseCategoryId(categoryId)
    if (categoryId !== undefined && normalizedCategoryId === undefined) {
      return NextResponse.json(
        { error: 'categoryId 类型错误' },
        { status: 400, headers: authResult.headers }
      )
    }

    const categoryValidation = await assertCategoryExists(normalizedCategoryId)
    if (!categoryValidation.ok) {
      return NextResponse.json(
        { error: categoryValidation.error },
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
    if (parsedTags.shouldUpdate) {
      const tagsValidation = await assertTagsExist(parsedTags.tags)
      if (!tagsValidation.ok) {
        return NextResponse.json(
          { error: tagsValidation.error },
          { status: 400, headers: authResult.headers }
        )
      }
    }

    const parsedIsProtected = isProtected === undefined ? undefined : parseBoolean(isProtected)
    if (isProtected !== undefined && parsedIsProtected === undefined) {
      return NextResponse.json(
        { error: 'isProtected 类型错误' },
        { status: 400, headers: authResult.headers }
      )
    }

    const nextIsProtected = parsedIsProtected ?? existingPost.isProtected
    const passwordProvided = typeof password === 'string' && password.trim().length > 0
    let passwordHashUpdate: string | null | undefined = undefined

    if (nextIsProtected) {
      if (passwordProvided) {
        const rawPassword = password.trim()
        if (rawPassword.length < 4) {
          return NextResponse.json(
            { error: '文章密码至少 4 位' },
            { status: 400, headers: authResult.headers }
          )
        }
        if (rawPassword.length > 64) {
          return NextResponse.json(
            { error: '文章密码过长' },
            { status: 400, headers: authResult.headers }
          )
        }
        passwordHashUpdate = await bcrypt.hash(rawPassword, 10)
      } else if (!existingPost.passwordHash) {
        return NextResponse.json(
          { error: '请设置文章访问密码' },
          { status: 400, headers: authResult.headers }
        )
      }
    } else {
      if (passwordProvided) {
        return NextResponse.json(
          { error: '未启用加密，无法设置密码' },
          { status: 400, headers: authResult.headers }
        )
      }
      if (parsedIsProtected === false) {
        passwordHashUpdate = null
      }
    }

    const post = await prisma.post.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(content !== undefined && {
          content,
          readingTime: Math.max(1, Math.round(readingTime(content).minutes)),
        }),
        ...(parsedExcerpt !== undefined && { excerpt: parsedExcerpt }),
        ...(parsedCoverImage !== undefined && { coverImage: parsedCoverImage }),
        ...(parsedStatus !== undefined && {
          status: parsedStatus,
          publishedAt:
            parsedStatus === PostStatus.PUBLISHED && !existingPost.publishedAt
              ? new Date()
              : existingPost.publishedAt,
        }),
        ...(parsedLocale !== undefined && { locale: parsedLocale }),
        ...(parsedCreatedAt ? { createdAt: parsedCreatedAt } : {}),
        ...(categoryValidation.resolvedCategoryId !== undefined && {
          category:
            categoryValidation.resolvedCategoryId === null
              ? { disconnect: true }
              : { connect: { id: categoryValidation.resolvedCategoryId } },
        }),
        ...(parsedIsProtected !== undefined && { isProtected: parsedIsProtected }),
        ...(passwordHashUpdate !== undefined && { passwordHash: passwordHashUpdate }),
        ...(parsedTags.shouldUpdate && {
          postTags: {
            deleteMany: {},
            create: parsedTags.tags.map((tagId) => ({ tagId })),
          },
        }),
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

    return NextResponse.json({ post }, { headers: authResult.headers })
  } catch (error) {
    console.error('插件更新文章失败:', error)
    return NextResponse.json({ error: '更新文章失败' }, { status: 500 })
  }
}

// DELETE /api/plugin/posts/[id] - 删除文章 (API Key)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiKey(req, 'POST_DELETE')
    if (!authResult.ok) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status, headers: authResult.headers }
      )
    }

    const { id } = await params

    const existingPost = await prisma.post.findUnique({ where: { id } })
    if (!existingPost) {
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }

    await prisma.post.delete({ where: { id } })

    return NextResponse.json({ message: '删除成功' }, { headers: authResult.headers })
  } catch (error) {
    console.error('插件删除文章失败:', error)
    return NextResponse.json({ error: '删除文章失败' }, { status: 500 })
  }
}
