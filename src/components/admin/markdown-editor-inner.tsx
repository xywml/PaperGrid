'use client'

import { useCallback } from 'react'
import { MdEditor, config } from 'md-editor-rt'
import { useTheme } from 'next-themes'
import { useToast } from '@/hooks/use-toast'
import 'md-editor-rt/lib/style.css'

// --- 注入本地 mermaid 和 katex 实例，避免通过 CDN 加载 ---
import mermaid from 'mermaid'
import katex from 'katex'
import 'katex/dist/katex.min.css'

config({
  editorExtensions: {
    mermaid: { instance: mermaid },
    katex: { instance: katex },
  },
})

// --- 类型定义 ---

export interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

// --- 主题映射 ---

/**
 * 将 next-themes 的主题值映射为 md-editor-rt 的主题值。
 * 非 'dark' 的任何值（包括 undefined、'system'、'light'）均映射为 'light'。
 */
export function resolveEditorTheme(theme: string | undefined): 'light' | 'dark' {
  return theme === 'dark' ? 'dark' : 'light'
}

// --- 图片上传 ---

/**
 * md-editor-rt 的 onUploadImg 回调。
 * 逐个将文件上传至 /api/admin/files，收集返回的 URL 后通过 callback 插入编辑器。
 */
export async function handleUploadImg(
  files: File[],
  callback: (urls: string[]) => void
): Promise<void> {
  const urls: string[] = []
  for (const file of files) {
    const fd = new FormData()
    fd.append('file', file)
    const response = await fetch('/api/admin/files', {
      method: 'POST',
      body: fd,
    })
    if (!response.ok) {
      throw new Error('图片上传失败')
    }
    const data = await response.json()
    urls.push(data.file.url)
  }
  callback(urls)
}

// --- 内部编辑器组件 ---

export default function MarkdownEditorInner({ value, onChange, disabled }: MarkdownEditorProps) {
  const { theme } = useTheme()
  const { toast } = useToast()

  const editorTheme = resolveEditorTheme(theme)

  const onUploadImg = useCallback(
    async (files: File[], callback: (urls: string[]) => void) => {
      try {
        await handleUploadImg(files, callback)
      } catch {
        toast({
          title: '上传失败',
          description: '图片上传失败，请稍后重试',
          variant: 'destructive',
        })
      }
    },
    [toast]
  )

  return (
    <MdEditor
      value={value}
      onChange={onChange}
      theme={editorTheme}
      previewTheme="default"
      codeTheme="atom"
      language="zh-CN"
      preview={true}
      disabled={disabled}
      onUploadImg={onUploadImg}
      noKatex={false}
      noMermaid={false}
    />
  )
}
