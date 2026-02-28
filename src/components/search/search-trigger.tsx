'use client'

import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import dynamic from 'next/dynamic'

const SearchCommand = dynamic(
  () => import('@/components/search/search-command').then((m) => m.SearchCommand),
  { ssr: false }
)

export function SearchTrigger() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        className="pg-public-search-trigger relative h-9 w-9 p-0 text-muted-foreground xl:h-10 xl:w-60 xl:justify-start xl:px-3 xl:text-sm"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4 xl:mr-2" />
        <span className="hidden xl:inline-flex">搜索...</span>
        <kbd className="pg-public-search-kbd pointer-events-none absolute right-1.5 top-2 hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] opacity-100 xl:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      {open ? <SearchCommand open={open} onOpenChange={setOpen} /> : null}

      {/* 全局键盘快捷键监听 */}
      <KeyboardShortcut onOpen={() => setOpen(true)} />
    </>
  )
}

function KeyboardShortcut({ onOpen }: { onOpen: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K 或 Cmd+K 打开搜索
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        onOpen()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onOpen])

  return null
}
