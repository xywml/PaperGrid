import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PostStatus } from '@prisma/client'
import { requireApiKey } from '@/lib/api-keys'
import readingTime from 'reading-time'

// GET /api/plugin/posts/[id] - 获取单个文章 (API Key)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiKey(req, 'POST_READ')
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
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

    return NextResponse.json({ post })
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
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
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
    } = body

    const normalizedCategoryId = categoryId === '' ? null : categoryId

    const post = await prisma.post.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && {
          content,
          readingTime: Math.max(1, Math.round(readingTime(String(content)).minutes)),
        }),
        ...(excerpt !== undefined && { excerpt }),
        ...(coverImage !== undefined && { coverImage }),
        ...(status !== undefined && {
          status,
          publishedAt:
            status === PostStatus.PUBLISHED && !existingPost.publishedAt
              ? new Date()
              : existingPost.publishedAt,
        }),
        ...(locale !== undefined && { locale }),
        ...(normalizedCategoryId !== undefined && { categoryId: normalizedCategoryId }),
        ...(tags && {
          postTags: {
            deleteMany: {},
            create: tags.map((tagId: string) => ({ tagId })),
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

    return NextResponse.json({ post })
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
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { id } = await params

    const existingPost = await prisma.post.findUnique({ where: { id } })
    if (!existingPost) {
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }

    await prisma.post.delete({ where: { id } })

    return NextResponse.json({ message: '删除成功' })
  } catch (error) {
    console.error('插件删除文章失败:', error)
    return NextResponse.json({ error: '删除文章失败' }, { status: 500 })
  }
}
