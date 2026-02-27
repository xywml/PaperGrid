import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createRequestLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import {
  ALLOWED_IMAGE_TYPES,
  MEDIA_MAX_INPUT_PIXELS,
  MEDIA_MAX_UPLOAD_BYTES,
  ensureMediaDir,
  getStoragePath,
  mediaUrlById,
  parseCompressionMode,
  sha256Hex,
} from '@/lib/media'
import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'
import type { MediaCompressionMode } from '@prisma/client'
import { unlink, writeFile } from 'node:fs/promises'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CompressionOutput = {
  content: Buffer
  ext: string
  mimeType: string
  width: number | null
  height: number | null
}

class UploadValidationError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

function buildImagePipeline(input: Buffer, mode: MediaCompressionMode, ext: string) {
  const pipeline = sharp(input, {
    failOn: 'error',
    limitInputPixels: MEDIA_MAX_INPUT_PIXELS,
  }).rotate()

  if (ext === 'jpg') {
    return pipeline.jpeg({ quality: mode === 'HIGH' ? 68 : 82, mozjpeg: true })
  }

  if (ext === 'png') {
    return pipeline.png({
      compressionLevel: 9,
      palette: true,
      quality: mode === 'HIGH' ? 70 : 85,
      effort: mode === 'HIGH' ? 10 : 8,
    })
  }

  if (ext === 'avif') {
    return pipeline.avif({
      quality: mode === 'HIGH' ? 45 : 58,
      effort: mode === 'HIGH' ? 6 : 4,
    })
  }

  return pipeline.webp({ quality: mode === 'HIGH' ? 65 : 78, effort: mode === 'HIGH' ? 6 : 4 })
}

async function processImageUpload(input: Buffer, mode: MediaCompressionMode): Promise<CompressionOutput> {
  const type = await fileTypeFromBuffer(input)

  if (!type || !ALLOWED_IMAGE_TYPES.has(type.mime)) {
    throw new UploadValidationError('只支持 JPG、PNG、WebP、AVIF 图片')
  }

  const targetExt = ALLOWED_IMAGE_TYPES.get(type.mime) || 'jpg'
  const metadata = await sharp(input, {
    failOn: 'error',
    limitInputPixels: MEDIA_MAX_INPUT_PIXELS,
  }).metadata()

  if (metadata.pages && metadata.pages > 1) {
    throw new UploadValidationError('暂不支持动图上传')
  }

  if (mode === 'ORIGINAL') {
    return {
      content: input,
      ext: targetExt,
      mimeType: type.mime,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
    }
  }

  const transformed = buildImagePipeline(input, mode, targetExt)
  const { data, info } = await transformed.toBuffer({ resolveWithObject: true })

  return {
    content: data,
    ext: targetExt,
    mimeType: type.mime,
    width: info.width ?? metadata.width ?? null,
    height: info.height ?? metadata.height ?? null,
  }
}

function toFilePayload(file: {
  id: string
  originalName: string
  mimeType: string
  ext: string
  size: number
  width: number | null
  height: number | null
  compressionMode: MediaCompressionMode
  createdAt: Date
  uploadedBy: { id: string; name: string | null; email: string | null } | null
}) {
  return {
    ...file,
    url: mediaUrlById(file.id),
  }
}

export async function GET(request: Request) {
  const logger = createRequestLogger(request, { module: 'admin-files', action: 'list' })
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('limit') || '24', 10) || 24))
    const q = (searchParams.get('q') || '').trim()

    const where = q
      ? {
          OR: [
            { originalName: { contains: q } },
            { ext: { contains: q } },
          ],
        }
      : {}

    const [total, files] = await Promise.all([
      prisma.mediaFile.count({ where }),
      prisma.mediaFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          ext: true,
          size: true,
          width: true,
          height: true,
          compressionMode: true,
          createdAt: true,
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ])

    return NextResponse.json({
      files: files.map((file) => toFilePayload(file)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      limits: {
        maxUploadBytes: MEDIA_MAX_UPLOAD_BYTES,
      },
    })
  } catch (error) {
    logger.error({ err: error }, '获取文件列表失败')
    return NextResponse.json({ error: '获取文件列表失败' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let logger = createRequestLogger(request, { module: 'admin-files', action: 'upload' })
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }
    logger = logger.child({ userId: session.user.id })

    const clientIp = getClientIp(request)
    const limiter = rateLimit(`upload:${session.user.id}:${clientIp}`, {
      windowMs: 60 * 1000,
      max: 20,
    })

    if (!limiter.ok) {
      const headers = rateLimitHeaders(limiter)
      return new NextResponse(JSON.stringify({ error: '上传过于频繁，请稍后重试' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...headers,
        },
      })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    const mode = parseCompressionMode(formData.get('compressionMode'))

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请选择图片文件' }, { status: 400 })
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: '文件为空' }, { status: 400 })
    }

    if (file.size > MEDIA_MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: '文件超过 10MB 限制' }, { status: 400 })
    }

    const input = Buffer.from(await file.arrayBuffer())

    if (input.length > MEDIA_MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: '文件超过 10MB 限制' }, { status: 400 })
    }

    const processed = await processImageUpload(input, mode)
    const storagePath = getStoragePath(processed.ext)
    const absolutePath = await ensureMediaDir(storagePath)

    await writeFile(absolutePath, processed.content, { flag: 'wx' })

    let record
    try {
      record = await prisma.mediaFile.create({
        data: {
          originalName: file.name || 'image',
          storagePath,
          mimeType: processed.mimeType,
          ext: processed.ext,
          size: processed.content.length,
          width: processed.width,
          height: processed.height,
          sha256: sha256Hex(processed.content),
          compressionMode: mode,
          uploadedById: session.user.id,
        },
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          ext: true,
          size: true,
          width: true,
          height: true,
          compressionMode: true,
          createdAt: true,
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      })
    } catch (dbError) {
      try {
        await unlink(absolutePath)
      } catch (cleanupError) {
        const nodeError = cleanupError as NodeJS.ErrnoException
        if (nodeError.code !== 'ENOENT') {
          logger.error({ err: cleanupError }, '回滚上传文件失败')
        }
      }

      throw dbError
    }

    return NextResponse.json({ file: toFilePayload(record) }, { status: 201 })
  } catch (error) {
    logger.error({ err: error }, '上传文件失败')

    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    const nodeError = error as NodeJS.ErrnoException
    if (nodeError?.code === 'EEXIST') {
      return NextResponse.json({ error: '文件名冲突，请重试上传' }, { status: 409 })
    }

    return NextResponse.json({ error: '上传文件失败' }, { status: 500 })
  }
}
