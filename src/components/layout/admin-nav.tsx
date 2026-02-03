'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, FileText, FolderKanban, Tags, MessageSquare, Users, Settings, Key, GalleryVerticalEnd, Palette } from 'lucide-react'

const Icons = { LayoutDashboard, FileText, FolderKanban, Tags, MessageSquare, Users, Settings, Key, GalleryVerticalEnd, Palette }

export function AdminNav({ items, onLinkClick }: { items: { href: string; iconName: string; label: string }[]; onLinkClick?: () => void }) {
  const pathname = usePathname()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [indicatorStyle, setIndicatorStyle] = useState<{ top: number; height: number; opacity: number }>({ top: 0, height: 0, opacity: 0 })

  // Determine active href without matching parent '/admin' for all children
  const getActiveHref = () => {
    for (const it of items) {
      if (pathname === it.href) return it.href
      if (it.href !== '/admin' && pathname?.startsWith(it.href + '/')) return it.href
    }
    // fallback: exact '/admin'
    if (pathname === '/admin') return '/admin'
    return null
  }

  const updateIndicator = () => {
    const activeHref = getActiveHref()
    if (!containerRef.current) return
    if (!activeHref) {
      setIndicatorStyle((s) => ({ ...s, opacity: 0 }))
      return
    }
    const el = itemRefs.current[activeHref]
    if (!el) {
      setIndicatorStyle((s) => ({ ...s, opacity: 0 }))
      return
    }
    const containerTop = containerRef.current.getBoundingClientRect().top
    const rect = el.getBoundingClientRect()
    setIndicatorStyle({ top: rect.top - containerTop, height: rect.height, opacity: 1 })
  }

  useEffect(() => {
    updateIndicator()
    const onResize = () => requestAnimationFrame(updateIndicator)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [pathname, items])

  return (
    <nav ref={containerRef} className="relative flex-1 space-y-1 p-4">
      {/* sliding indicator */}
      <span
        aria-hidden
        style={{ top: indicatorStyle.top, height: indicatorStyle.height, opacity: indicatorStyle.opacity }}
        className="pointer-events-none absolute left-0 w-1 rounded-r-lg bg-blue-600 transition-all duration-200"
      />

      {items.map((item) => {
        const Icon = Icons[item.iconName as keyof typeof Icons]
        const active = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href + '/'))
        return (
          <Link key={item.href} href={item.href} className="relative block">
            <div
              ref={(el) => { itemRefs.current[item.href] = el }}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? 'bg-gray-100 text-blue-600 dark:bg-gray-700 dark:text-blue-400' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'}`}
            >
              {Icon && <Icon className="h-5 w-5" />}
              <span>{item.label}</span>
            </div>
          </Link>
        )
      })}
    </nav>
  )
}
