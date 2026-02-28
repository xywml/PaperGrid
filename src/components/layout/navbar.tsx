'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { SearchTrigger } from '@/components/search/search-trigger'
import { useSession } from 'next-auth/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogIn } from 'lucide-react'
import { MobileNav } from '@/components/layout/mobile-nav'

import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

export function Navbar({ settings }: { settings?: Record<string, unknown> }) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [postTitle, setPostTitle] = useState('')
  const [showProgressUI, setShowProgressUI] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const titleClearRef = useRef<NodeJS.Timeout | null>(null)
  const s: Record<string, unknown> = settings || {}
  const hideAdminEntry = Boolean(s['ui.hideAdminEntry'])
  const siteTitle = typeof s['site.title'] === 'string' ? s['site.title'] : '执笔为剑'
  const defaultAvatarUrl =
    typeof s['site.defaultAvatarUrl'] === 'string' ? s['site.defaultAvatarUrl'] : ''
  const isPostDetail = Boolean(pathname?.includes('/posts/') && pathname !== '/posts')

  useEffect(() => {
    if (!isPostDetail) {
      setShowProgressUI(false)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      if (titleClearRef.current) {
        clearTimeout(titleClearRef.current)
      }
      titleClearRef.current = setTimeout(() => {
        setPostTitle('')
        titleClearRef.current = null
      }, 500)
    } else if (titleClearRef.current) {
      clearTimeout(titleClearRef.current)
      titleClearRef.current = null
    }
  }, [isPostDetail])

  useEffect(() => {
    const handleTitleChange: EventListener = (event) => {
      const nextTitle = (event as CustomEvent<string>).detail ?? ''
      if (!nextTitle && !isPostDetail) return
      setPostTitle(nextTitle)
    }
    window.addEventListener('post-title-changed', handleTitleChange)

    const handleScroll = () => {
      // Only show title UI on post detail pages and when there is a title
      if (isPostDetail) {
        setShowProgressUI(true)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
          setShowProgressUI(false)
        }, 3000)
      } else {
        setShowProgressUI(false)
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => {
      window.removeEventListener('post-title-changed', handleTitleChange)
      window.removeEventListener('scroll', handleScroll)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (titleClearRef.current) clearTimeout(titleClearRef.current)
    }
  }, [isPostDetail])

  // 在管理后台下不展示前台导航栏
  if (pathname?.startsWith('/admin')) return null

  return (
    <nav className="pg-public-nav sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-lg dark:border-gray-800 dark:bg-gray-900/80">
      <div className="relative flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* 左侧菜单 */}
        <div
          className={`flex items-center gap-2 transition-all duration-300 ${showProgressUI ? 'pointer-events-none -translate-x-4 scale-95 opacity-0' : 'translate-x-0 scale-100 opacity-100'}`}
        >
          <MobileNav showOnDesktop />
          <Link
            href="/"
            className="max-w-[40vw] truncate text-base font-bold tracking-tight sm:max-w-none sm:text-lg"
          >
            {siteTitle}
          </Link>
        </div>

        {/* 导航菜单 (中心部分) */}
        <div className="flex h-full flex-1 items-center justify-center overflow-hidden px-4">
          <div
            className={`hidden items-center gap-6 transition-all duration-300 md:flex ${showProgressUI ? 'pointer-events-none -translate-y-8 opacity-0' : 'translate-y-0 opacity-100'}`}
          >
            {[
              { href: '/', label: '首页' },
              { href: '/posts', label: '文章' },
              { href: '/archive', label: '归档' },
              { href: '/categories', label: '分类' },
              { href: '/tags', label: '标签' },
              { href: '/yaji', label: '雅集' },
              { href: '/about', label: '关于' },
            ].map((item) => {
              const active =
                pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`pg-public-nav-link relative px-2 py-1 text-sm font-medium transition-colors ${active ? 'pg-public-nav-link-active text-gray-900 dark:text-white' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                >
                  {item.label}
                  <span
                    className={`pg-public-nav-indicator absolute bottom-0 left-1/2 h-0.5 transform rounded bg-gray-900 transition-all dark:bg-white ${active ? 'w-6 -translate-x-1/2 opacity-100' : 'w-0 opacity-0'}`}
                  />
                </Link>
              )
            })}
          </div>
        </div>

        {/* 2. 文章标题 (绝对定位居中，确保处于屏幕水平中心) */}
        <div
          className={`pointer-events-none absolute inset-0 flex items-center justify-center px-12 transition-all duration-500 ${showProgressUI ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
        >
          <span className="pg-public-nav-title max-w-2xl truncate text-center text-sm font-bold text-gray-900 md:text-base dark:text-white">
            {postTitle}
          </span>
        </div>

        {/* 右侧操作区 */}
        <div
          className={`flex items-center gap-2 transition-all duration-300 ${showProgressUI ? 'pointer-events-none translate-x-4 scale-95 opacity-0' : 'translate-x-0 scale-100 opacity-100'}`}
        >
          {/* 搜索 */}
          <SearchTrigger />

          {/* 主题切换 */}
          <div className="flex items-center justify-center p-0">
            <ThemeToggle />
          </div>

          {/* 用户菜单 */}
          {!hideAdminEntry && (
            <div className="flex min-w-[40px] items-center justify-end">
              {session?.user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                      <Avatar className="h-9 w-9">
                        <AvatarImage
                          src={session.user.image || defaultAvatarUrl || undefined}
                          alt={session.user.name || 'User'}
                        />
                        <AvatarFallback className="border border-gray-900 bg-gray-50 font-serif text-gray-900 dark:border-white dark:bg-gray-800 dark:text-white">
                          {session.user.name?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm leading-none font-medium">{session.user.name}</p>
                        <p className="text-muted-foreground text-xs leading-none">
                          {session.user.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {session?.user?.role === 'ADMIN' && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href="/admin">管理后台</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem
                      onClick={async () => {
                        // 使用 NextAuth 的 signOut
                        const { signOut } = await import('next-auth/react')
                        await signOut({ callbackUrl: '/' })
                      }}
                    >
                      退出登录
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : session === undefined ? (
                <div className="h-9 w-9 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800" />
              ) : (
                <Link href="/auth/signin">
                  <Button size="sm" variant="ghost">
                    <LogIn className="mr-2 h-4 w-4" />
                    登录
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
