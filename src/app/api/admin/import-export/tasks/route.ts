import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createTask } from '@/lib/import-export/tasks'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CREATE_TASK_LIMIT = {
  windowMs: 5 * 60 * 1000,
  max: 10,
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const limitResult = rateLimit(
      `admin-import-export:${session.user.id}:${getClientIp(request)}`,
      CREATE_TASK_LIMIT
    )
    if (!limitResult.ok) {
      return NextResponse.json(
        { error: '操作过于频繁，请稍后重试' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const formData = await request.formData()
    const type = String(formData.get('type') || '').trim()
    const includeSensitiveRaw = String(formData.get('includeSensitive') || '').trim()
    const sourceRaw = String(formData.get('source') || '').trim()
    const fileValue = formData.get('file')

    const task = await createTask({
      type,
      createdById: session.user.id,
      includeSensitiveRaw,
      sourceRaw,
      file: fileValue instanceof File ? fileValue : null,
    })

    return NextResponse.json(
      { task },
      { status: 201, headers: rateLimitHeaders(limitResult) }
    )
  } catch (error) {
    console.error('创建导入导出任务失败:', error)
    const message = error instanceof Error ? error.message : '创建任务失败'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
