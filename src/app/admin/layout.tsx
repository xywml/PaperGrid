import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import {
  LayoutDashboard,
  FileText,
  FolderKanban,
  Tags,
  MessageSquare,
  Users,
  Settings,
  LogOut,
  Menu,
  GalleryVerticalEnd
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { AdminNav } from '@/components/layout/admin-nav'
import { AdminContentTransition } from '@/components/layout/admin-content'
import { AdminLoadingFallback } from '@/components/layout/admin-loading-fallback'
import { AdminMobileSidebar } from '@/components/layout/admin-mobile-sidebar'
import { getSetting } from '@/lib/settings'
import { isDefaultAdmin } from '@/lib/admin-default'

const navItems = [
  { href: '/admin', iconName: 'LayoutDashboard', label: '仪表板' },
  { href: '/admin/posts', iconName: 'FileText', label: '文章管理' },
  { href: '/admin/works', iconName: 'GalleryVerticalEnd', label: '作品展示' },
  { href: '/admin/categories', iconName: 'FolderKanban', label: '分类管理' },
  { href: '/admin/tags', iconName: 'Tags', label: '标签管理' },
  { href: '/admin/comments', iconName: 'MessageSquare', label: '评论管理' },
  { href: '/admin/users', iconName: 'Users', label: '用户管理' },
  { href: '/admin/api-keys', iconName: 'Key', label: '接口密钥' },
  { href: '/admin/styles', iconName: 'Palette', label: '样式管理' },
  { href: '/admin/settings', iconName: 'Settings', label: '系统设置' },
]

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  const defaultAvatarUrl = (await getSetting<string>('site.defaultAvatarUrl', '')) || ''
  const adminInitialSetup = await isDefaultAdmin()
  const rawVersion = process.env.APP_VERSION || ''
  const appVersion = rawVersion ? (rawVersion.startsWith('v') ? rawVersion : `v${rawVersion}`) : ''

  if (!session?.user) {
    redirect('/auth/signin')
  }

  if (session.user.role !== 'ADMIN') {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex h-16 items-center justify-between px-4">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <AdminMobileSidebar items={navItems} />
            <Link href="/admin" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="text-sm font-bold text-primary-foreground">博</span>
              </div>
              <span className="hidden font-semibold sm:inline-block">
                博客管理后台
              </span>
            </Link>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-4">
            {appVersion && (
              <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                <span className="font-mono">{appVersion}</span>
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={session.user.image || defaultAvatarUrl || undefined} alt={session.user.name || 'User'} />
                    <AvatarFallback>
                      {session.user.name?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{session.user.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {session.user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/">查看网站</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/admin/settings">设置</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <form
                  action={async () => {
                    'use server'
                    const { signOut } = await import('@/lib/auth')
                    await signOut({ redirectTo: '/' })
                  }}
                >
                  <DropdownMenuItem asChild>
                    <button type="submit" className="w-full cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>退出登录</span>
                    </button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden w-64 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 lg:flex">
          <AdminNav items={navItems} />
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 font-sans">
          {adminInitialSetup && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-100">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">已启用默认管理员账号</span>
                <span className="text-amber-800/80 dark:text-amber-100/80">
                  邮箱: admin@example.com · 密码: admin123
                </span>
                <Link href="/admin/settings" className="font-medium underline underline-offset-2">
                  立即修改账号与密码
                </Link>
              </div>
            </div>
          )}
          <Suspense fallback={<AdminLoadingFallback delayMs={500} />}>
            <AdminContentTransition>{children}</AdminContentTransition>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
