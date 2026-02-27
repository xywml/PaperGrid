import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createRequestLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { mediaUrlById, resolveMediaPath } from '@/lib/media'
import { removeCachedMediaResolvedFile } from '@/lib/media-file-cache'
import { unlink } from 'node:fs/promises'

export const runtime = 'nodejs'

const SETTING_KEYS = ['site.logoUrl', 'site.faviconUrl', 'site.defaultAvatarUrl']
const MEDIA_URL_PREFIX = '/api/files/'

function unwrapSettingValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined
  const values = Object.values(value as Record<string, unknown>)
  return values.length > 0 ? values[0] : undefined
}

function normalizeMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const raw = value.trim()
  if (!raw) return null

  try {
    const parsed = raw.startsWith('/') ? new URL(raw, 'http://papergrid.local') : new URL(raw)
    const pathname = parsed.pathname.replace(/\/+$/, '')
    return pathname || '/'
  } catch {
    return null
  }
}

function isMediaUrlReference(value: unknown, mediaId: string): boolean {
  return normalizeMediaUrl(value) === mediaUrlById(mediaId)
}

async function getReferenceSummary(mediaId: string) {
  const targetUrl = mediaUrlById(mediaId)
  const fuzzyHint = `${MEDIA_URL_PREFIX}${mediaId}`

  const [postRows, projectRows, userRows, settingRows] = await Promise.all([
    prisma.post.findMany({
      where: {
        OR: [{ coverImage: targetUrl }, { coverImage: { contains: fuzzyHint } }],
      },
      select: { coverImage: true },
    }),
    prisma.project.findMany({
      where: {
        OR: [{ image: targetUrl }, { image: { contains: fuzzyHint } }],
      },
      select: { image: true },
    }),
    prisma.user.findMany({
      where: {
        OR: [{ image: targetUrl }, { image: { contains: fuzzyHint } }],
      },
      select: { image: true },
    }),
    prisma.setting.findMany({
      where: { key: { in: SETTING_KEYS } },
      select: { key: true, value: true },
    }),
  ])

  const posts = postRows.filter((row) => isMediaUrlReference(row.coverImage, mediaId)).length
  const projects = projectRows.filter((row) => isMediaUrlReference(row.image, mediaId)).length
  const users = userRows.filter((row) => isMediaUrlReference(row.image, mediaId)).length
  const settings = settingRows
    .filter((row) => isMediaUrlReference(unwrapSettingValue(row.value), mediaId))
    .map((row) => row.key)

  return {
    posts,
    projects,
    users,
    settings,
    total: posts + projects + users + settings.length,
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let logger = createRequestLogger(request, { module: 'admin-files', action: 'delete' })
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }
    logger = logger.child({ userId: session.user.id })

    const { id } = await params
    logger = logger.child({ mediaId: id })
    const media = await prisma.mediaFile.findUnique({
      where: { id },
    })

    if (!media) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === '1'

    const references = await getReferenceSummary(media.id)

    if (!force && references.total > 0) {
      return NextResponse.json(
        {
          error: '该图片仍在服务站点内容，建议先替换引用后再删除',
          references,
        },
        { status: 409 }
      )
    }

    const deleted = await prisma.mediaFile.delete({ where: { id } })
    removeCachedMediaResolvedFile(id)

    const absolutePath = resolveMediaPath(deleted.storagePath)

    try {
      await unlink(absolutePath)
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException

      if (nodeError.code !== 'ENOENT') {
        logger.error({ err: nodeError }, '删除本地文件失败，准备回滚数据库记录')

        try {
          await prisma.mediaFile.create({
            data: {
              id: deleted.id,
              originalName: deleted.originalName,
              storagePath: deleted.storagePath,
              mimeType: deleted.mimeType,
              ext: deleted.ext,
              size: deleted.size,
              width: deleted.width,
              height: deleted.height,
              sha256: deleted.sha256,
              compressionMode: deleted.compressionMode,
              uploadedById: deleted.uploadedById,
              createdAt: deleted.createdAt,
            },
          })
        } catch (rollbackError) {
          logger.error({ err: rollbackError }, '回滚媒体记录失败')
        }

        return NextResponse.json({ error: '删除文件失败，请重试' }, { status: 500 })
      }
    }

    return NextResponse.json({ message: '删除成功' })
  } catch (error) {
    logger.error({ err: error }, '删除文件失败')
    return NextResponse.json({ error: '删除文件失败' }, { status: 500 })
  }
}
