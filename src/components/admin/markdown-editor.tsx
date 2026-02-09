'use client'

import dynamic from 'next/dynamic'

export type { MarkdownEditorProps } from './markdown-editor-inner'
export { resolveEditorTheme, handleUploadImg } from './markdown-editor-inner'

/**
 * 通过 dynamic import 加载编辑器，禁用 SSR。
 * md-editor-rt 依赖浏览器 API，无法在服务端渲染。
 */
const MarkdownEditor = dynamic(
  () => import('./markdown-editor-inner'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[500px] items-center justify-center rounded-md border bg-muted/50">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-sm">编辑器加载中...</span>
        </div>
      </div>
    ),
  }
)

export { MarkdownEditor }
