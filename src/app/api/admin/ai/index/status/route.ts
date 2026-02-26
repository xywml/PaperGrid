import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAiIndexTaskStatus } from '@/lib/ai/index-tasks'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LIMIT = {
  windowMs: 60 * 1000,
  max: 120,
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const limitResult = rateLimit(
      `admin-ai-index-status:${session.user.id}:${getClientIp(request)}`,
      LIMIT
    )
    if (!limitResult.ok) {
      return NextResponse.json(
        { error: '请求过于频繁' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const status = await getAiIndexTaskStatus()
    return NextResponse.json(status, {
      headers: {
        ...rateLimitHeaders(limitResult),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('获取索引状态失败:', error)
    return NextResponse.json({ error: '获取索引状态失败' }, { status: 500 })
  }
}
