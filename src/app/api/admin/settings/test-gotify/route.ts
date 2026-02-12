import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { GotifyServiceError, sendGotifyTestNotification } from '@/lib/notifications/gotify-service'

// POST /api/admin/settings/test-gotify
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const title = typeof body.title === 'string' && body.title.trim()
      ? body.title.trim()
      : '测试推送 - 执笔为剑'
    const message = typeof body.message === 'string' && body.message.trim()
      ? body.message.trim()
      : '这是一条来自 执笔为剑 的 Gotify 测试通知'
    const priority = typeof body.priority === 'number' && Number.isFinite(body.priority)
      ? body.priority
      : 5

    await sendGotifyTestNotification({ title, message, priority })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Gotify 测试推送失败:', error)
    if (error instanceof GotifyServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: '推送失败，请检查 Gotify 配置或网络连接' },
      { status: 500 }
    )
  }
}
