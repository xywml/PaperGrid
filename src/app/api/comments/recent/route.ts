import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSetting } from '@/lib/settings'

// GET /api/comments/recent?limit=5 - 获取最新评论（已审核）
export async function GET(request: NextRequest) {
  try {
    const commentsEnabled = (await getSetting<boolean>('comments.enabled', true)) ?? true
    if (!commentsEnabled) {
      return NextResponse.json({ error: '评论功能已关闭' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const limitParam = parseInt(searchParams.get('limit') || '5')
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 10) : 5

    const comments = await prisma.comment.findMany({
      where: { status: 'APPROVED', post: { isProtected: false } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        author: { select: { name: true } },
        post: { select: { title: true, slug: true } },
      },
    })

    return NextResponse.json({ comments })
  } catch (error) {
    console.error('获取最新评论失败:', error)
    return NextResponse.json({ error: '获取最新评论失败' }, { status: 500 })
  }
}
