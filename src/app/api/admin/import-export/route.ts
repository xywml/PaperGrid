import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function ensureAdmin() {
  const session = await auth()
  return Boolean(session?.user && session.user.role === 'ADMIN')
}

export async function GET() {
  if (!(await ensureAdmin())) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  return NextResponse.json({
    message: '请使用 /api/admin/import-export/tasks 提交异步任务',
  })
}

export async function POST() {
  if (!(await ensureAdmin())) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  return NextResponse.json(
    {
      error: '该接口已升级为异步任务，请调用 /api/admin/import-export/tasks',
    },
    { status: 400 }
  )
}
