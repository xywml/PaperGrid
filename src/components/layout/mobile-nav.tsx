'use client'

import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'

const subscribeHydration = () => () => {}

export function MobileNav({
  isOpen,
  onOpenChange,
  side = 'left',
  showTrigger = true,
  showOnDesktop = false,
}: {
  isOpen?: boolean
  onOpenChange?: (v: boolean) => void
  side?: 'left' | 'top'
  showTrigger?: boolean
  showOnDesktop?: boolean
}) {
  const isHydrated = useSyncExternalStore(subscribeHydration, () => true, () => false)
  const { data: session } = useSession()
  const [internalOpen, setInternalOpen] = useState(false)
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [isFocusInside, setIsFocusInside] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const open = typeof isOpen === 'boolean' ? isOpen : internalOpen
  const setOpen = (v: boolean) => {
    if (typeof onOpenChange === 'function') onOpenChange(v)
    else setInternalOpen(v)
  }

  const pathname = usePathname()
  const isAdmin = pathname?.startsWith('/admin')
  const getSettingString = (key: string, fallback = '') => {
    const value = settings[key]
    return typeof value === 'string' ? value : fallback
  }
  const logoUrl = getSettingString('site.logoUrl')
  const logoSrc = logoUrl.trim() || '/logo.svg'
  const siteTitle = getSettingString('site.title', '执笔为剑')
  const displayName = isAdmin
    ? session?.user?.name || '管理员'
    : getSettingString('site.ownerName', '千叶')
  const tagline = getSettingString('profile.tagline', '全栈开发者 / 技术分享')
  const signature =
    getSettingString('profile.signature', '“热爱技术, 喜欢分享。这里记录我的学习和成长过程。”')
  const defaultAvatarUrl = getSettingString('site.defaultAvatarUrl')
  const siteTitleForFooter = getSettingString('site.title', '执笔为剑')
  const isTopDrawer = side === 'top'

  useEffect(() => {
    fetch('/api/settings/public')
      .then((res) => res.json())
      .then((data: unknown) => {
        if (typeof data === 'object' && data !== null) {
          setSettings(data as Record<string, unknown>)
          return
        }
        setSettings({})
      })
      .catch((err) => console.error('Failed to load settings', err))
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
    if (open) return
    const active = document.activeElement
    if (active && containerRef.current?.contains(active)) {
      triggerRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleFocusIn = () => setIsFocusInside(true)
    const handleFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null
      if (!next || !container.contains(next)) {
        setIsFocusInside(false)
      }
    }

    container.addEventListener('focusin', handleFocusIn)
    container.addEventListener('focusout', handleFocusOut)

    return () => {
      container.removeEventListener('focusin', handleFocusIn)
      container.removeEventListener('focusout', handleFocusOut)
    }
  }, [])

  const blogLinks = [
    { href: '/', label: '首页' },
    { href: '/posts', label: '文章' },
    { href: '/archive', label: '归档' },
    { href: '/categories', label: '分类' },
    { href: '/tags', label: '标签' },
    { href: '/yaji', label: '雅集' },
    { href: '/about', label: '关于' },
  ]

  const adminLinks = [
    { href: '/admin', label: '仪表板' },
    { href: '/admin/posts', label: '文章管理' },
    { href: '/admin/works', label: '作品展示' },
    { href: '/admin/categories', label: '分类管理' },
    { href: '/admin/tags', label: '标签管理' },
    { href: '/admin/comments', label: '评论管理' },
    { href: '/admin/users', label: '用户管理' },
    { href: '/admin/settings', label: '系统设置' },
  ]

  const links = isAdmin ? adminLinks : blogLinks

  const SidebarContent = (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[100] flex overflow-hidden ${isTopDrawer ? 'items-start' : ''} ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!open && !isFocusInside}
      inert={!open && !isFocusInside ? true : undefined}
    >
      {/* backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => open && setOpen(false)}
      />

      {/* panel (left slide-in) */}
      <div
        data-drawer-side={isTopDrawer ? 'top' : 'left'}
        className={`pg-public-drawer-panel relative z-10 transform bg-white p-6 shadow-2xl transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform dark:bg-gray-900 ${isTopDrawer ? 'max-h-[85vh] w-full overflow-auto' : 'h-full w-72'} ${open ? (isTopDrawer ? 'translate-y-0 opacity-100' : 'translate-x-0 opacity-100') : (isTopDrawer ? '-translate-y-[calc(100%+16px)] opacity-0' : '-translate-x-[calc(100%+24px)] opacity-0')}`}
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-md p-0.5 ${isAdmin ? 'bg-amber-500' : 'bg-primary'}`}
            >
              <img
                src={logoSrc}
                alt={`${siteTitle} logo`}
                className="h-full w-full scale-110 object-cover"
                loading="eager"
                decoding="async"
              />
            </div>
            <span className="pg-public-drawer-title text-lg font-bold tracking-tight">
              {isAdmin ? '管理后台' : siteTitle}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="pg-public-drawer-icon-btn"
            onClick={() => setOpen(false)}
            aria-label="关闭菜单"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* User Info Section */}
        <div className="mb-6 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="border-primary/10 h-12 w-12 border-2">
              <AvatarImage src={session?.user?.image || defaultAvatarUrl || undefined} />
              <AvatarFallback className="bg-primary/5 text-primary">
                {session?.user?.name?.charAt(0).toUpperCase() || 'B'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="pg-public-drawer-user-name truncate font-bold text-gray-900 dark:text-white">
                {displayName}
              </p>
              <p className="pg-public-drawer-user-meta truncate text-xs text-gray-500 dark:text-gray-400">
                {tagline}
              </p>
            </div>
          </div>
          <p className="pg-public-drawer-user-meta text-sm leading-relaxed text-gray-600 italic dark:text-gray-400">
            {signature}
          </p>
        </div>

        <Separator className="mb-6" />

        <nav className="space-y-1">
          {links.map((link) => {
            const active =
              pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href))
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`pg-public-drawer-link flex items-center rounded-md px-4 py-3 text-base font-medium transition-all ${active ? 'pg-public-drawer-link-active bg-primary/10 text-primary shadow-sm' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="absolute right-6 bottom-8 left-6">
          <p className="text-center text-xs text-gray-400 dark:text-gray-500">
            © {new Date().getFullYear()} {siteTitleForFooter} · Built with Next.js
          </p>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <div className={showOnDesktop ? '' : 'md:hidden'}>
        {showTrigger && (
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            className="pg-public-nav-icon-btn"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? '关闭菜单' : '打开菜单'}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        )}
      </div>

      {isHydrated ? createPortal(SidebarContent, document.body) : null}
    </>
  )
}
