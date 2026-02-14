import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTask } from '@/lib/import-export/tasks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { id } = await params
    const task = await getTask(id)
    return NextResponse.json({ task })
  } catch (error) {
    console.error('获取任务状态失败:', error)
    const message = error instanceof Error ? error.message : '获取任务状态失败'
    const status = message.includes('ENOENT') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
