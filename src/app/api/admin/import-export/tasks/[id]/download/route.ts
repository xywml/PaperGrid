import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getTaskDownload } from '@/lib/import-export/tasks'

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
    const artifact = await getTaskDownload(id)

    const encoded = encodeURIComponent(artifact.fileName)
    return new NextResponse(artifact.content, {
      status: 200,
      headers: {
        'Content-Type': artifact.mimeType,
        'Content-Disposition': `attachment; filename="${artifact.fileName}"; filename*=UTF-8''${encoded}`,
      },
    })
  } catch (error) {
    console.error('下载任务结果失败:', error)
    const message = error instanceof Error ? error.message : '下载任务结果失败'
    const status = message.includes('ENOENT') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
