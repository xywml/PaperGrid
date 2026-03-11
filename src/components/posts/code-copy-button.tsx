'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { copyTextToClipboard } from '@/lib/copy-to-clipboard'

export function CodeCopyButton() {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      className="flex items-center rounded-md p-1 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
      title={copied ? '已复制' : '复制代码'}
      onClick={async (e) => {
        const root = e.currentTarget.closest('[data-code-block]')
        const codeEl = root?.querySelector('code') as HTMLElement | null
        const text = codeEl?.innerText ?? ''
        if (!text) return

        try {
          const copiedSuccessfully = await copyTextToClipboard(text)
          if (!copiedSuccessfully) return
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        } catch {
          // ignore
        }
      }}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-gray-400" />
      )}
    </button>
  )
}
