'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { UploadImgCallBackParam } from 'md-editor-rt'
import { Button } from '@/components/ui/button'
import { MDXContentClient } from '@/components/posts/mdx-content-client'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const MdEditor = dynamic(() => import('md-editor-rt').then((mod) => mod.MdEditor), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground flex h-[520px] items-center justify-center rounded-lg border text-sm">
      正在加载编辑器...
    </div>
  ),
})

type MobileMode = 'edit' | 'preview'

type PostMarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  height?: number | string
  onUploadingChange?: (uploading: boolean) => void
}

type UploadedImage = {
  url: string
  alt: string
  title: string
}

type UploadApiResponse = {
  file?: {
    url?: string
  }
  error?: string
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024

let cachedMaxUploadBytes: number | null = null
let maxUploadBytesRequest: Promise<number | null> | null = null

function requestMaxUploadBytes() {
  if (cachedMaxUploadBytes !== null) {
    return Promise.resolve(cachedMaxUploadBytes)
  }

  if (!maxUploadBytesRequest) {
    maxUploadBytesRequest = fetch('/api/admin/files?limit=1', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          return null
        }

        const data = await res.json()
        if (typeof data?.limits?.maxUploadBytes === 'number') {
          cachedMaxUploadBytes = data.limits.maxUploadBytes
          return data.limits.maxUploadBytes
        }

        return null
      })
      .catch(() => null)
      .finally(() => {
        maxUploadBytesRequest = null
      })
  }

  return maxUploadBytesRequest
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function isAllowedImageFile(file: File) {
  return ALLOWED_IMAGE_TYPES.has(file.type)
}

function syncScrollPosition(source: HTMLElement, target: HTMLElement) {
  const sourceMax = source.scrollHeight - source.clientHeight
  const targetMax = target.scrollHeight - target.clientHeight

  if (sourceMax <= 0 || targetMax <= 0) {
    target.scrollTop = 0
    return
  }

  const ratio = source.scrollTop / sourceMax
  target.scrollTop = ratio * targetMax
}

export function PostMarkdownEditor({
  value,
  onChange,
  disabled,
  placeholder,
  height,
  onUploadingChange,
}: PostMarkdownEditorProps) {
  const { toast } = useToast()
  const { resolvedTheme } = useTheme()
  const [isMounted, setIsMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileMode, setMobileMode] = useState<MobileMode>('edit')
  const [maxUploadBytes, setMaxUploadBytes] = useState(DEFAULT_MAX_UPLOAD_BYTES)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [desktopEditorReadyVersion, setDesktopEditorReadyVersion] = useState(0)
  const deferredValue = useDeferredValue(value)
  const desktopEditorWrapperRef = useRef<HTMLDivElement | null>(null)
  const desktopPreviewScrollRef = useRef<HTMLDivElement | null>(null)
  const syncDirectionRef = useRef<'editor' | 'preview' | null>(null)
  const syncResetFrameRef = useRef<number | null>(null)

  const notifyDesktopEditorReady = useCallback(() => {
    if (!desktopEditorWrapperRef.current?.querySelector('.cm-scroller')) {
      return
    }

    setDesktopEditorReadyVersion((prev) => prev + 1)
  }, [])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')

    const update = () => {
      const mobile = media.matches
      setIsMobile(mobile)
      if (!mobile) {
        setMobileMode('edit')
      }
    }

    update()
    media.addEventListener('change', update)

    return () => {
      media.removeEventListener('change', update)
    }
  }, [])

  useEffect(() => {
    if (isMobile) {
      return
    }

    const wrapper = desktopEditorWrapperRef.current
    if (!wrapper) {
      return
    }

    if (wrapper.querySelector('.cm-scroller')) {
      setDesktopEditorReadyVersion((prev) => prev + 1)
      return
    }

    const observer = new MutationObserver(() => {
      if (!wrapper.querySelector('.cm-scroller')) {
        return
      }

      setDesktopEditorReadyVersion((prev) => prev + 1)
      observer.disconnect()
    })

    observer.observe(wrapper, {
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
    }
  }, [isMobile])

  useEffect(() => {
    let cancelled = false

    requestMaxUploadBytes().then((nextMaxUploadBytes) => {
      if (!cancelled && typeof nextMaxUploadBytes === 'number') {
        setMaxUploadBytes(nextMaxUploadBytes)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    onUploadingChange?.(uploadingCount > 0)
  }, [onUploadingChange, uploadingCount])

  useEffect(() => {
    if (isMobile) {
      return
    }

    const editorScrollElement = desktopEditorWrapperRef.current?.querySelector(
      '.cm-scroller'
    ) as HTMLElement | null
    const previewScrollElement = desktopPreviewScrollRef.current

    if (!editorScrollElement || !previewScrollElement) {
      return
    }

    const releaseSyncLock = () => {
      if (syncResetFrameRef.current !== null) {
        cancelAnimationFrame(syncResetFrameRef.current)
      }

      syncResetFrameRef.current = requestAnimationFrame(() => {
        syncDirectionRef.current = null
      })
    }

    const handleEditorScroll = () => {
      if (syncDirectionRef.current === 'preview') {
        return
      }

      syncDirectionRef.current = 'editor'
      syncScrollPosition(editorScrollElement, previewScrollElement)
      releaseSyncLock()
    }

    const handlePreviewScroll = () => {
      if (syncDirectionRef.current === 'editor') {
        return
      }

      syncDirectionRef.current = 'preview'
      syncScrollPosition(previewScrollElement, editorScrollElement)
      releaseSyncLock()
    }

    editorScrollElement.addEventListener('scroll', handleEditorScroll, { passive: true })
    previewScrollElement.addEventListener('scroll', handlePreviewScroll, { passive: true })

    syncScrollPosition(editorScrollElement, previewScrollElement)

    return () => {
      editorScrollElement.removeEventListener('scroll', handleEditorScroll)
      previewScrollElement.removeEventListener('scroll', handlePreviewScroll)

      if (syncResetFrameRef.current !== null) {
        cancelAnimationFrame(syncResetFrameRef.current)
        syncResetFrameRef.current = null
      }
      syncDirectionRef.current = null
    }
  }, [isMobile, deferredValue, desktopEditorReadyVersion])

  const editorTheme = isMounted && resolvedTheme === 'dark' ? 'dark' : 'light'

  const editorPlaceholder = useMemo(
    () => placeholder || '# 开始写作...\n\n支持 Markdown 语法和图片粘贴/拖拽上传。',
    [placeholder]
  )

  const maxUploadLabel = useMemo(() => formatBytes(maxUploadBytes), [maxUploadBytes])
  const hasFixedHeight =
    typeof height === 'number' || (typeof height === 'string' && height.trim().length > 0)
  const editorHeight = useMemo(() => {
    if (typeof height === 'number') {
      return `${height}px`
    }

    if (typeof height === 'string' && height.trim().length > 0) {
      return height
    }

    return '520px'
  }, [height])

  const uploadSingleImage = async (file: File): Promise<UploadedImage> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('compressionMode', 'BALANCED')

    const response = await fetch('/api/admin/files', {
      method: 'POST',
      body: formData,
    })

    let data: UploadApiResponse | null = null
    try {
      data = (await response.json()) as UploadApiResponse
    } catch {
      data = null
    }

    if (!response.ok) {
      throw new Error(data?.error || `${file.name || '图片'} 上传失败`)
    }

    const url = typeof data?.file?.url === 'string' ? data.file.url : ''
    if (!url) {
      throw new Error(`${file.name || '图片'} 上传失败：未返回可用 URL`)
    }

    const title = file.name || 'image'
    return {
      url,
      alt: title,
      title,
    }
  }

  const uploadImages = async (files: File[]) => {
    const invalidTypeNames: string[] = []
    const overLimitNames: string[] = []
    const validFiles: File[] = []

    for (const file of files) {
      if (!isAllowedImageFile(file)) {
        invalidTypeNames.push(file.name || '未命名文件')
        continue
      }

      if (file.size > maxUploadBytes) {
        overLimitNames.push(file.name || '未命名文件')
        continue
      }

      validFiles.push(file)
    }

    if (invalidTypeNames.length > 0) {
      toast({
        title: '包含不支持的格式',
        description: `仅支持 JPG/PNG/WebP/AVIF，已跳过 ${invalidTypeNames.length} 张图片`,
        variant: 'destructive',
      })
    }

    if (overLimitNames.length > 0) {
      toast({
        title: '图片超出大小限制',
        description: `单图上限 ${maxUploadLabel}，已跳过 ${overLimitNames.length} 张图片`,
        variant: 'destructive',
      })
    }

    if (validFiles.length === 0) {
      return [] as UploadedImage[]
    }

    setUploadingCount((prev) => prev + validFiles.length)

    try {
      const limit = Math.min(3, validFiles.length)
      const results: Array<UploadedImage | null> = Array(validFiles.length).fill(null)
      const uploadErrors: string[] = []
      let pointer = 0

      const worker = async () => {
        while (pointer < validFiles.length) {
          const currentIndex = pointer
          pointer += 1

          const file = validFiles[currentIndex]
          try {
            results[currentIndex] = await uploadSingleImage(file)
          } catch (error) {
            uploadErrors.push(
              error instanceof Error ? error.message : `${file.name || '图片'} 上传失败`
            )
          }
        }
      }

      await Promise.all(Array.from({ length: limit }, worker))

      if (uploadErrors.length > 0) {
        toast({
          title: '部分图片上传失败',
          description: uploadErrors[0],
          variant: 'destructive',
        })
      }

      const uploaded = results.filter((item): item is UploadedImage => Boolean(item))

      if (uploaded.length > 0) {
        toast({
          title: '上传成功',
          description: `已上传 ${uploaded.length} 张图片并自动回填`,
        })
      }

      return uploaded
    } finally {
      setUploadingCount((prev) => Math.max(0, prev - validFiles.length))
    }
  }

  const handleUploadImg = async (
    files: Array<File>,
    callback: (urls: UploadImgCallBackParam) => void
  ) => {
    const uploaded = await uploadImages(files)
    if (uploaded.length === 0) {
      return
    }

    callback(uploaded.map((item) => ({ url: item.url, alt: item.alt, title: item.title })))
  }

  const handleDrop = (event: DragEvent) => {
    const files = event.dataTransfer?.files
    if (!files || files.length === 0) {
      return
    }

    const hasImage = Array.from(files).some(isAllowedImageFile)
    if (!hasImage) {
      event.preventDefault()
      toast({
        title: '仅支持图片拖拽',
        description: '请拖拽 JPG/PNG/WebP/AVIF 图片文件',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className={cn('flex flex-col gap-3', hasFixedHeight && 'h-full min-h-0')}>
      <div className="flex items-center justify-between gap-2 md:hidden">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={mobileMode === 'edit' ? 'default' : 'outline'}
            disabled={disabled}
            onClick={() => setMobileMode('edit')}
          >
            编辑
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mobileMode === 'preview' ? 'default' : 'outline'}
            disabled={disabled}
            onClick={() => setMobileMode('preview')}
          >
            预览
          </Button>
        </div>
        <span className="text-muted-foreground text-xs">移动端可切换编辑/预览</span>
      </div>

      <div className={cn('min-h-0', hasFixedHeight && 'flex-1')}>
        {isMobile ? (
          mobileMode === 'preview' ? (
            <div
              className="bg-card overflow-hidden rounded-lg border p-4"
              style={{ height: editorHeight }}
            >
              <div className="post-editor-preview-scroll h-full overflow-y-auto pr-2">
                <MDXContentClient content={deferredValue} />
              </div>
            </div>
          ) : (
            <div
              className="bg-card overflow-hidden rounded-lg border"
              style={{ height: editorHeight }}
            >
              <MdEditor
                modelValue={value}
                onChange={onChange}
                disabled={disabled}
                language="zh-CN"
                theme={editorTheme}
                className="post-editor-md h-full border-0"
                style={{ height: '100%' }}
                preview={false}
                placeholder={editorPlaceholder}
                autoDetectCode
                codeFoldable
                onUploadImg={handleUploadImg}
                onDrop={handleDrop}
                onRemount={notifyDesktopEditorReady}
                onError={(error) => {
                  toast({
                    title: '编辑器错误',
                    description: error.message,
                    variant: 'destructive',
                  })
                }}
              />
            </div>
          )
        ) : (
          <div className="grid h-full min-h-0 gap-4 lg:grid-cols-2">
            <div
              ref={desktopEditorWrapperRef}
              className="bg-card overflow-hidden rounded-lg border"
              style={{ height: editorHeight }}
            >
              <MdEditor
                modelValue={value}
                onChange={onChange}
                disabled={disabled}
                language="zh-CN"
                theme={editorTheme}
                className="post-editor-md h-full border-0"
                preview={false}
                placeholder={editorPlaceholder}
                autoDetectCode
                codeFoldable
                style={{ height: '100%' }}
                onUploadImg={handleUploadImg}
                onDrop={handleDrop}
                onRemount={notifyDesktopEditorReady}
                onError={(error) => {
                  toast({
                    title: '编辑器错误',
                    description: error.message,
                    variant: 'destructive',
                  })
                }}
              />
            </div>
            <div
              className="bg-card flex flex-col overflow-hidden rounded-lg border p-4"
              style={{ height: editorHeight }}
            >
              <div className="text-muted-foreground mb-3 shrink-0 text-xs">
                实时预览（与发布页同渲染链路）
              </div>
              <div
                ref={desktopPreviewScrollRef}
                className="post-editor-preview-scroll min-h-0 flex-1 overflow-y-auto pr-2"
              >
                <MDXContentClient content={deferredValue} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
        <span>支持粘贴/拖拽图片自动上传并回填 URL（上限 {maxUploadLabel}）</span>
        {uploadingCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在上传 {uploadingCount} 张图片...
          </span>
        )}
      </div>
    </div>
  )
}
