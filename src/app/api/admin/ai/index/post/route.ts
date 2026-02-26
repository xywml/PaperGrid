import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { enqueuePostDeleteIndexTask, enqueuePostUpsertIndexTask } from '@/lib/ai/index-tasks'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LIMIT = {
  windowMs: 60 * 1000,
  max: 30,
}

type RequestBody = {
  postId?: unknown
  action?: unknown
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const limitResult = rateLimit(
      `admin-ai-index-post:${session.user.id}:${getClientIp(request)}`,
      LIMIT
    )

    if (!limitResult.ok) {
      return NextResponse.json(
        { error: '操作过于频繁，请稍后重试' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const body = (await request.json().catch(() => ({} as RequestBody))) as RequestBody
    const postId = typeof body.postId === 'string' ? body.postId.trim() : ''
    const action = typeof body.action === 'string' ? body.action.trim() : 'upsert'

    if (!postId) {
      return NextResponse.json(
        { error: 'postId 不能为空' },
        { status: 400, headers: rateLimitHeaders(limitResult) }
      )
    }

    const task =
      action === 'delete'
        ? await enqueuePostDeleteIndexTask(postId, {
            requestedBy: session.user.id,
          })
        : await enqueuePostUpsertIndexTask(postId, {
            requestedBy: session.user.id,
          })

    return NextResponse.json(
      {
        ok: true,
        task,
      },
      {
        status: 202,
        headers: rateLimitHeaders(limitResult),
      }
    )
  } catch (error) {
    console.error('提交文章索引任务失败:', error)
    const message = error instanceof Error ? error.message : '提交任务失败'
    const status = message === '任务队列已满，请稍后重试' ? 429 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
