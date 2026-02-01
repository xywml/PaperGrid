import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/admin/posts - 获取文章列表（支持筛选/搜索）
export async function GET(request: Request) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim() || ''
    const status = searchParams.get('status') || ''
    const categoryId = searchParams.get('categoryId') || ''

    const where: any = {}
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { excerpt: { contains: q } },
        { content: { contains: q } },
      ]
    }
    if (status && ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
      where.status = status
    }
    if (categoryId) {
      where.categoryId = categoryId
    }

    const posts = await prisma.post.findMany({
      where,
      select: {
        id: true,
        title: true,
        excerpt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            name: true,
            email: true,
          },
        },
        category: {
          select: {
            name: true,
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
      take: 20,
    })

    return NextResponse.json({ posts })
  } catch (error) {
    console.error('获取文章失败:', error)
    return NextResponse.json({ error: '获取文章失败' }, { status: 500 })
  }
}
