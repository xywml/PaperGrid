import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import {
  buildPostUnlockToken,
  POST_UNLOCK_MAX_AGE,
} from '@/lib/post-protection'

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`post-unlock:${getClientIp(request)}`, {
      windowMs: 5 * 60 * 1000,
      max: 20,
    })
    if (!limit.ok) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试' },
        { status: 429, headers: rateLimitHeaders(limit) }
      )
    }

    const body = await request.json()
    const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!slug || !password) {
      return NextResponse.json({ error: '缺少文章或密码' }, { status: 400 })
    }

    const post = await prisma.post.findFirst({
      where: {
        slug,
        status: 'PUBLISHED',
      },
      select: {
        id: true,
        isProtected: true,
        passwordHash: true,
      },
    })

    if (!post || !post.isProtected || !post.passwordHash) {
      return NextResponse.json({ error: '文章未加密或不存在' }, { status: 404 })
    }

    const ok = await bcrypt.compare(password, post.passwordHash)
    if (!ok) {
      return NextResponse.json({ error: '密码错误' }, { status: 401 })
    }

    const token = buildPostUnlockToken(post.id, post.passwordHash)

    return NextResponse.json({ ok: true, token, postId: post.id, maxAge: POST_UNLOCK_MAX_AGE })
  } catch (error) {
    console.error('文章解锁失败:', error)
    return NextResponse.json({ error: '解锁失败' }, { status: 500 })
  }
}
