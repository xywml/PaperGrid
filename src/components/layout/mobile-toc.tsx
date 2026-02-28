'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface HeadingItem {
  id: string
  text: string
  level: number
}

export function MobileToc({ isOpen, onOpenChange }: { isOpen?: boolean; onOpenChange?: (v: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [activeId, setActiveId] = useState('')

  const open = typeof isOpen === 'boolean' ? isOpen : internalOpen
  const setOpen = (v: boolean) => {
    if (typeof onOpenChange === 'function') onOpenChange(v)
    else setInternalOpen(v)
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  // Lock body scroll when menu is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const container = document.querySelector('.mdx-content')
    if (!container) {
      setHeadings([])
      return
    }
    const elements = Array.from(container.querySelectorAll('h1, h2, h3')) as HTMLElement[]
    const collected = elements
      .map((el, index) => {
        const text = (el.textContent || '').trim()
        if (!text) return null
        if (!el.id) {
          el.id = `heading-${index}`
        }
        return {
          id: el.id,
          text,
          level: el.tagName === 'H1' ? 1 : el.tagName === 'H2' ? 2 : 3,
        }
      })
      .filter(Boolean) as HeadingItem[]
    setHeadings(collected)

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0) {
            setActiveId(entry.target.id)
          }
        })
      },
      {
        rootMargin: '-80px 0px -80% 0px',
        threshold: [0, 1],
      }
    )

    elements.forEach((element) => observer.observe(element))

    return () => {
      elements.forEach((element) => observer.unobserve(element))
      observer.disconnect()
    }
  }, [open])

  useEffect(() => {
    if (!open || headings.length === 0) return

    const getActiveId = () => {
      const offset = 120
      let currentId = headings[0]?.id || ''
      for (const heading of headings) {
        const el = document.getElementById(heading.id)
        if (!el) continue
        const top = el.getBoundingClientRect().top
        if (top - offset <= 0) {
          currentId = heading.id
        } else {
          break
        }
      }
      return currentId
    }

    let ticking = false
    const update = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        setActiveId(getActiveId())
        ticking = false
      })
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [open, headings])

  const handleClick = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const offset = 90
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - offset
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' })
    }
    setActiveId(id)
    setOpen(false)
  }

  const SidebarContent = (
    <div
      className={`fixed inset-0 z-[100] flex overflow-hidden md:hidden ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      {/* backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => open && setOpen(false)}
      />

      {/* panel (right slide-in) */}
      <div
        data-drawer-side="right"
        className={`pg-public-drawer-panel relative z-10 ml-auto flex h-full w-72 transform flex-col bg-white p-6 shadow-2xl transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform dark:bg-gray-900 ${open ? 'translate-x-0 opacity-100' : 'translate-x-[calc(100%+24px)] opacity-0'}`}
      >
        <div className="mb-6 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight">目录</span>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="关闭目录">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {headings.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">暂无目录</div>
        ) : (
          <nav className="mt-2 flex-1 space-y-2 overflow-y-auto pr-2 overscroll-contain">
            {headings.map((heading) => (
              <button
                key={heading.id}
                onClick={() => handleClick(heading.id)}
                className={`pg-public-drawer-link block w-full text-left text-sm transition-all duration-200 ${activeId === heading.id ? 'pg-public-drawer-link-active text-blue-600 dark:text-blue-400 font-medium translate-x-1' : 'text-gray-700 hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400'} ${heading.level === 1 ? 'pl-0' : heading.level === 2 ? 'pl-4' : 'pl-8'}`}
              >
                {heading.text}
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  )

  return mounted ? createPortal(SidebarContent, document.body) : null
}
