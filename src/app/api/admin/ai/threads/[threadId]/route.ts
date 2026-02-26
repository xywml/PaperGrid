import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { deleteAiThread, getAiThread, saveAiThread, type AiThreadMessage } from '@/lib/ai/thread-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GET_LIMIT = {
  windowMs: 60 * 1000,
  max: 120,
}

const PUT_LIMIT = {
  windowMs: 60 * 1000,
  max: 120,
}

const DELETE_LIMIT = {
  windowMs: 60 * 1000,
  max: 30,
}

function normalizeMessages(raw: unknown): AiThreadMessage[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const role = (item as { role?: unknown }).role
      const content = (item as { content?: unknown }).content
      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
        return null
      }

      const trimmed = content.trim()
      if (!trimmed) {
        return null
      }

      return {
        role,
        content: trimmed.slice(0, 10000),
      } satisfies AiThreadMessage
    })
    .filter((item): item is AiThreadMessage => Boolean(item))
    .slice(-100)
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ threadId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const limitResult = rateLimit(
      `admin-ai-thread-get:${session.user.id}:${getClientIp(request)}`,
      GET_LIMIT
    )
    if (!limitResult.ok) {
      return NextResponse.json(
        { error: '请求过于频繁' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const { threadId } = await context.params
    const thread = await getAiThread(session.user.id, threadId)
    if (!thread) {
      return NextResponse.json(
        { error: '会话不存在' },
        { status: 404, headers: rateLimitHeaders(limitResult) }
      )
    }

    return NextResponse.json(
      { thread },
      {
        headers: {
          ...rateLimitHeaders(limitResult),
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    console.error('获取 AI 会话失败:', error)
    const message = error instanceof Error ? error.message : '获取 AI 会话失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ threadId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const limitResult = rateLimit(
      `admin-ai-thread-put:${session.user.id}:${getClientIp(request)}`,
      PUT_LIMIT
    )
    if (!limitResult.ok) {
      return NextResponse.json(
        { error: '操作过于频繁，请稍后重试' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const { threadId } = await context.params
    const body = await request.json().catch(() => ({} as Record<string, unknown>))

    const title = typeof body.title === 'string' ? body.title : undefined
    const model = typeof body.model === 'string' ? body.model : undefined
    const messages = normalizeMessages(body.messages)

    const thread = await saveAiThread({
      userId: session.user.id,
      threadId,
      title,
      model,
      messages,
    })

    return NextResponse.json(
      { thread },
      {
        headers: rateLimitHeaders(limitResult),
      }
    )
  } catch (error) {
    console.error('保存 AI 会话失败:', error)
    const message = error instanceof Error ? error.message : '保存 AI 会话失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ threadId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const limitResult = rateLimit(
      `admin-ai-thread-delete:${session.user.id}:${getClientIp(request)}`,
      DELETE_LIMIT
    )
    if (!limitResult.ok) {
      return NextResponse.json(
        { error: '操作过于频繁，请稍后重试' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const { threadId } = await context.params
    const ok = await deleteAiThread(session.user.id, threadId)

    return NextResponse.json(
      { ok },
      {
        headers: rateLimitHeaders(limitResult),
      }
    )
  } catch (error) {
    console.error('删除 AI 会话失败:', error)
    const message = error instanceof Error ? error.message : '删除 AI 会话失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
