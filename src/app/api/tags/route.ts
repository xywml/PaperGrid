import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { revalidatePublicTaxonomyPaths } from '@/lib/post-revalidate'

// GET /api/tags - 获取标签列表
export async function GET() {
  try {
    const tags = await prisma.tag.findMany({
      include: {
        _count: {
          select: {
            posts: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    })

    return NextResponse.json({ tags })
  } catch (error) {
    console.error('获取标签失败:', error)
    return NextResponse.json({ error: '获取标签失败' }, { status: 500 })
  }
}

// POST /api/tags - 创建标签
export async function POST(req: Request) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }

    const body = await req.json()
    const { name, slug } = body

    if (!name || !slug) {
      return NextResponse.json(
        { error: '名称和 slug 不能为空' },
        { status: 400 }
      )
    }

    // 检查 slug 是否已存在
    const existingTag = await prisma.tag.findUnique({
      where: { slug },
    })

    if (existingTag) {
      return NextResponse.json(
        { error: '标签 slug 已存在' },
        { status: 400 }
      )
    }

    const tag = await prisma.tag.create({
      data: {
        name,
        slug,
      },
    })

    revalidatePublicTaxonomyPaths({
      tagSlugs: [tag.slug],
    })

    return NextResponse.json({ tag }, { status: 201 })
  } catch (error) {
    console.error('创建标签失败:', error)
    return NextResponse.json({ error: '创建标签失败' }, { status: 500 })
  }
}
