'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Menu, Home, ArrowUp, X, Plus, BookOpen } from 'lucide-react'
import { MobileNav } from './mobile-nav'
import { MobileToc } from './mobile-toc'
import { useRouter, usePathname } from 'next/navigation'

export function FloatingActions({ visible = true }: { visible?: boolean }) {
  const [open, setOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const isPostDetail = pathname?.startsWith('/posts/') && pathname !== '/posts'

  useEffect(() => {
    // when nav panel opens, collapse floating actions
    if (navOpen) {
      setOpen(false)
      setTocOpen(false)
    }
  }, [navOpen])

  useEffect(() => {
    if (tocOpen) {
      setOpen(false)
      setNavOpen(false)
    }
  }, [tocOpen])

  useEffect(() => {
    // when overall visibility changes to hidden, ensure floating menu stack closed
    // but LEAVE navOpen (sidebar) alone so it doesn't vanish while user is using it
    if (!visible) {
      setOpen(false)
    }
  }, [visible])

  const handleScrollTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setOpen(false)
  }

  const handleGoHome = () => {
    router.push('/')
    setOpen(false)
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 flex items-end transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
      {/* Controlled mobile nav panel (left side) */}
      <MobileNav isOpen={navOpen} onOpenChange={setNavOpen} side="left" showTrigger={false} />
      {/* Mobile TOC panel (right side) */}
      <MobileToc isOpen={tocOpen} onOpenChange={setTocOpen} />

      <div className="flex flex-col items-center gap-2">
        {/* Buttons stack (appear when open) */}
        <div className={`flex flex-col items-center gap-2 transition-all duration-200 ${open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
          {/* Menu */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setNavOpen(true)}
            aria-label="打开菜单"
            className="pg-public-fab-btn bg-white/90 shadow-md dark:bg-gray-800/90"
          >
            <Menu className="h-5 w-5 text-gray-700 dark:text-gray-200" />
          </Button>

          {/* TOC (mobile only, post detail only) */}
          {isPostDetail && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setTocOpen(true)}
              aria-label="打开目录"
              className="pg-public-fab-btn bg-white/90 shadow-md dark:bg-gray-800/90 md:hidden"
            >
              <BookOpen className="h-5 w-5 text-gray-700 dark:text-gray-200" />
            </Button>
          )}

          {/* Home */}
          <Button
            size="icon"
            variant="ghost"
            onClick={handleGoHome}
            aria-label="回到首页"
            className="pg-public-fab-btn bg-white/90 shadow-md dark:bg-gray-800/90"
          >
            <Home className="h-5 w-5 text-gray-700 dark:text-gray-200" />
          </Button>

          {/* Scroll to top */}
          <Button
            size="icon"
            variant="ghost"
            onClick={handleScrollTop}
            aria-label="回到顶部"
            className="pg-public-fab-btn bg-white/90 shadow-md dark:bg-gray-800/90"
          >
            <ArrowUp className="h-5 w-5 text-gray-700 dark:text-gray-200" />
          </Button>

          {/* Collapse */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setOpen(false)}
            aria-label="收起"
            className="pg-public-fab-btn bg-white/90 shadow-md dark:bg-gray-800/90"
          >
            <X className="h-5 w-5 text-gray-700 dark:text-gray-200" />
          </Button>
        </div>

        {/* Main floating toggle button */}
        <Button
          size="icon"
          onClick={() => setOpen((s) => !s)}
          aria-label="更多操作"
          className="pg-public-fab-main bg-primary text-primary-foreground shadow-lg"
        >
          {open ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </Button>
      </div>
    </div>
  )
}
