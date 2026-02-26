import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { listAiThreads, saveAiThread } from '@/lib/ai/thread-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GET_LIMIT = {
  windowMs: 60 * 1000,
  max: 300,
}

const POST_LIMIT = {
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
      `admin-ai-threads-list:${session.user.id}:${getClientIp(request)}`,
      GET_LIMIT
    )
    if (!limitResult.ok) {
      return NextResponse.json(
        { error: '请求过于频繁' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const threads = await listAiThreads(session.user.id)
    return NextResponse.json(
      { threads },
      {
        headers: {
          ...rateLimitHeaders(limitResult),
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    console.error('获取 AI 会话列表失败:', error)
    const message = error instanceof Error ? error.message : '获取 AI 会话列表失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const limitResult = rateLimit(
      `admin-ai-threads-create:${session.user.id}:${getClientIp(request)}`,
      POST_LIMIT
    )
    if (!limitResult.ok) {
      return NextResponse.json(
        { error: '操作过于频繁，请稍后重试' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const title = typeof body.title === 'string' ? body.title : 'New Chat'
    const model = typeof body.model === 'string' ? body.model : undefined

    const thread = await saveAiThread({
      userId: session.user.id,
      title,
      model,
      messages: [],
    })

    return NextResponse.json(
      { thread },
      {
        status: 201,
        headers: rateLimitHeaders(limitResult),
      }
    )
  } catch (error) {
    console.error('创建 AI 会话失败:', error)
    const message = error instanceof Error ? error.message : '创建 AI 会话失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
