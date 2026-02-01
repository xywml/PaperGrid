import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPostUnlockTokenFromHeaders, verifyPostUnlockToken } from '@/lib/post-protection'

// GET /api/posts/protected?slug=xxx - 获取受保护文章内容
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')

    if (!slug) {
      return NextResponse.json({ error: '缺少文章 slug' }, { status: 400 })
    }

    const post = await prisma.post.findFirst({
      where: {
        slug,
        status: 'PUBLISHED',
      },
      select: {
        id: true,
        content: true,
        isProtected: true,
        passwordHash: true,
      },
    })

    if (!post) {
      return NextResponse.json({ error: '文章不存在' }, { status: 404 })
    }

    if (!post.isProtected) {
      return NextResponse.json({ error: '文章未加密' }, { status: 400 })
    }

    if (!post.passwordHash) {
      return NextResponse.json({ error: '文章已加密' }, { status: 403 })
    }

    const token = getPostUnlockTokenFromHeaders(request.headers)
    const unlocked = token
      ? verifyPostUnlockToken(token, post.id, post.passwordHash)
      : false

    if (!unlocked) {
      return NextResponse.json({ error: '未解锁或密码错误' }, { status: 401 })
    }

    return NextResponse.json({ content: post.content })
  } catch (error) {
    console.error('获取受保护文章失败:', error)
    return NextResponse.json({ error: '获取文章失败' }, { status: 500 })
  }
}
