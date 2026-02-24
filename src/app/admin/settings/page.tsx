'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { ImagePickerDialog } from '@/components/admin/image-picker-dialog'
import { Loader2 } from 'lucide-react'
import { useSession } from 'next-auth/react'

type Setting = {
  key: string
  value: Record<string, unknown> | null
  group: string
  editable: boolean
  secret: boolean
  description?: string
}

type SettingsTabKey = 'basic' | 'profile' | 'interaction' | 'gotify' | 'security'

const SETTINGS_TABS: Array<{ key: SettingsTabKey; label: string }> = [
  { key: 'basic', label: '基础' },
  { key: 'profile', label: '资料' },
  { key: 'interaction', label: '互动' },
  { key: 'gotify', label: '推送' },
  { key: 'security', label: '安全' },
]

function isSettingsTabKey(value: string | null): value is SettingsTabKey {
  return (
    value === 'basic' ||
    value === 'profile' ||
    value === 'interaction' ||
    value === 'gotify' ||
    value === 'security'
  )
}

function buildSettingsSnapshot(items: Setting[]): string {
  const normalized = [...items]
    .map((item) => ({
      key: item.key,
      value: item.value
        ? Object.fromEntries(
            Object.entries(item.value).sort(([leftKey], [rightKey]) =>
              leftKey.localeCompare(rightKey)
            )
          )
        : null,
    }))
    .sort((left, right) => left.key.localeCompare(right.key))

  return JSON.stringify(normalized)
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [savedSettingsSnapshot, setSavedSettingsSnapshot] = useState('[]')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [accountSaving, setAccountSaving] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [activeTab, setActiveTab] = useState<SettingsTabKey>('basic')
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [pendingLeaveHref, setPendingLeaveHref] = useState<string | null>(null)
  const tabListRef = useRef<HTMLDivElement | null>(null)
  const tabButtonRefs = useRef<Partial<Record<SettingsTabKey, HTMLButtonElement | null>>>({})
  const [tabIndicator, setTabIndicator] = useState<{
    left: number
    top: number
    width: number
    height: number
    visible: boolean
  }>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    visible: false,
  })
  const { data: session } = useSession()
  const { toast } = useToast()

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (res.ok) {
        const enabledSetting = data.settings.find((it: Setting) => it.key === 'comments.enabled')
        const enabledVal = enabledSetting?.value ? Object.values(enabledSetting.value)[0] : true
        const allowGuestSetting = data.settings.find(
          (it: Setting) => it.key === 'comments.allowGuest'
        )
        const allowGuestVal = allowGuestSetting?.value
          ? Object.values(allowGuestSetting.value)[0]
          : false
        const normalized = data.settings.map((it: Setting) => {
          if (it.key === 'comments.allowGuest' && !enabledVal) {
            return { ...it, value: { enabled: false } }
          }
          if (it.key === 'comments.guestModerationRequired' && (!enabledVal || !allowGuestVal)) {
            return { ...it, value: { enabled: false } }
          }
          return it
        })
        setSettings(normalized)
        setSavedSettingsSnapshot(buildSettingsSnapshot(normalized))
      } else {
        toast({ title: '错误', description: data.error || '获取设置失败', variant: 'destructive' })
      }
    } catch (e) {
      console.error(e)
      toast({ title: '错误', description: '获取设置失败', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (isSettingsTabKey(tab)) {
      setActiveTab(tab)
    }
  }, [])

  const getVal = (key: string) => {
    const s = settings.find((it) => it.key === key)
    return s?.value ? Object.values(s.value)[0] : ''
  }

  const getBoolVal = (key: string, defaultValue = false): boolean => {
    const value = getVal(key)
    if (typeof value === 'boolean') return value
    if (value === 'true' || value === '1' || value === true) return true
    if (value === 'false' || value === '0' || value === false) return false
    return defaultValue
  }

  const setVal = (key: string, newVal: unknown) => {
    setSettings((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it
        const firstKey = it.value ? Object.keys(it.value)[0] : undefined
        return { ...it, value: { [firstKey || 'value']: newVal } }
      })
    )
  }

  const hasUnsavedSettings = useMemo(
    () => buildSettingsSnapshot(settings) !== savedSettingsSnapshot,
    [settings, savedSettingsSnapshot]
  )
  const hasUnsavedAccountForm = Boolean(
    newEmail.trim() || currentPassword || newPassword || confirmPassword
  )
  const hasUnsavedChanges = hasUnsavedSettings || hasUnsavedAccountForm
  const shouldBlockNavigation = hasUnsavedChanges && !saving && !accountSaving

  const save = async () => {
    setSaving(true)
    try {
      const commentsEnabled = getVal('comments.enabled')
      const allowGuest = getVal('comments.allowGuest')
      const updates = settings.map((s) => {
        if (s.key === 'comments.allowGuest' && !commentsEnabled) {
          return { key: s.key, value: { enabled: false } }
        }
        if (s.key === 'comments.guestModerationRequired' && (!commentsEnabled || !allowGuest)) {
          return { key: s.key, value: { enabled: false } }
        }
        return { key: s.key, value: s.value }
      })
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      const data = await res.json()
      if (res.ok) {
        toast({ title: '成功', description: '设置已保存' })
        await fetchSettings()
      } else {
        toast({ title: '错误', description: data.error || '保存失败', variant: 'destructive' })
      }
    } catch (e) {
      console.error(e)
      toast({ title: '错误', description: '保存失败', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const initialSetup = useMemo(() => {
    const s = settings.find((it) => it.key === 'admin.initialSetup')
    if (!s) return true
    const val = s.value ? Object.values(s.value)[0] : false
    return Boolean(val)
  }, [settings])

  const updateAdminAccount = async () => {
    const trimmedEmail = newEmail.trim()
    if (!currentPassword) {
      toast({ title: '错误', description: '请输入当前密码', variant: 'destructive' })
      return
    }
    if (!trimmedEmail && !newPassword) {
      toast({ title: '错误', description: '请至少修改邮箱或密码', variant: 'destructive' })
      return
    }
    if (newPassword && newPassword !== confirmPassword) {
      toast({ title: '错误', description: '两次输入的新密码不一致', variant: 'destructive' })
      return
    }

    setAccountSaving(true)
    try {
      const res = await fetch('/api/admin/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newEmail: trimmedEmail || undefined,
          newPassword: newPassword || undefined,
          confirmPassword: confirmPassword || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast({ title: '成功', description: '管理员账号已更新，建议重新登录' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setNewEmail('')
        await fetchSettings()
      } else {
        toast({ title: '错误', description: data.error || '更新失败', variant: 'destructive' })
      }
    } catch (e) {
      console.error(e)
      toast({ title: '错误', description: '更新失败', variant: 'destructive' })
    } finally {
      setAccountSaving(false)
    }
  }

  const handleTabChange = (tab: SettingsTabKey) => {
    setActiveTab(tab)
    if (typeof window === 'undefined') return
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.set('tab', tab)
    window.history.replaceState(window.history.state, '', nextUrl.toString())
  }

  const updateTabIndicator = useCallback(() => {
    const listEl = tabListRef.current
    const activeButton = tabButtonRefs.current[activeTab]
    if (!listEl || !activeButton) {
      setTabIndicator((prev) => (prev.visible ? { ...prev, visible: false } : prev))
      return
    }

    const listRect = listEl.getBoundingClientRect()
    const buttonRect = activeButton.getBoundingClientRect()
    const nextLeft = buttonRect.left - listRect.left
    const nextTop = buttonRect.top - listRect.top
    const nextWidth = buttonRect.width
    const nextHeight = buttonRect.height
    setTabIndicator((prev) => {
      if (
        prev.left === nextLeft &&
        prev.top === nextTop &&
        prev.width === nextWidth &&
        prev.height === nextHeight &&
        prev.visible
      ) {
        return prev
      }
      return {
        left: nextLeft,
        top: nextTop,
        width: nextWidth,
        height: nextHeight,
        visible: true,
      }
    })
  }, [activeTab])

  const openLeaveDialog = useCallback((href: string) => {
    setPendingLeaveHref(href)
    setLeaveDialogOpen(true)
  }, [])

  const continueLeave = useCallback(() => {
    if (!pendingLeaveHref || typeof window === 'undefined') return
    setPendingLeaveHref(null)
    setLeaveDialogOpen(false)
    window.location.assign(pendingLeaveHref)
  }, [pendingLeaveHref])

  const handleLeaveDialogOpenChange = useCallback((open: boolean) => {
    setLeaveDialogOpen(open)
    if (!open) {
      setPendingLeaveHref(null)
    }
  }, [])

  const cancelLeave = useCallback(() => {
    setLeaveDialogOpen(false)
    setPendingLeaveHref(null)
  }, [])

  useEffect(() => {
    if (!shouldBlockNavigation || typeof window === 'undefined') return

    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target as HTMLElement | null
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return

      const current = new URL(window.location.href)
      const next = new URL(anchor.href, window.location.href)
      const httpLike = next.protocol === 'http:' || next.protocol === 'https:'
      if (!httpLike) return

      const sameLocation =
        current.pathname === next.pathname &&
        current.search === next.search &&
        current.hash === next.hash
      if (sameLocation) return

      event.preventDefault()
      event.stopPropagation()
      openLeaveDialog(next.toString())
    }

    document.addEventListener('click', handleDocumentClick, true)
    return () => {
      document.removeEventListener('click', handleDocumentClick, true)
    }
  }, [openLeaveDialog, shouldBlockNavigation])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const rafId = window.requestAnimationFrame(() => {
      updateTabIndicator()
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [activeTab, updateTabIndicator])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => updateTabIndicator()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [updateTabIndicator])

  const tabColumns = Math.min(SETTINGS_TABS.length, 5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">系统设置</h1>
        <p className="text-muted-foreground">管理网站全局配置（仅管理员）</p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <div ref={tabListRef} className="bg-muted/30 relative rounded-xl border p-1">
              <div
                className="bg-primary pointer-events-none absolute rounded-lg shadow-md transition-all duration-300 ease-out"
                style={{
                  left: `${tabIndicator.left}px`,
                  top: `${tabIndicator.top}px`,
                  width: `${tabIndicator.width}px`,
                  height: `${tabIndicator.height}px`,
                  opacity: tabIndicator.visible ? 1 : 0,
                }}
              />
              <div
                className="relative z-10 grid gap-0 overflow-hidden rounded-lg"
                style={{ gridTemplateColumns: `repeat(${tabColumns}, minmax(0, 1fr))` }}
              >
                {SETTINGS_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    ref={(el) => {
                      tabButtonRefs.current[tab.key] = el
                    }}
                    type="button"
                    className={`h-9 min-w-0 px-2 text-xs font-semibold whitespace-nowrap transition-colors sm:h-10 sm:px-3 sm:text-sm ${
                      activeTab === tab.key
                        ? 'text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => handleTabChange(tab.key)}
                    disabled={saving}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {loading && <p className="text-muted-foreground text-xs">正在同步最新设置...</p>}
        </CardContent>
      </Card>

      {activeTab === 'basic' && (
        <Card>
          <CardHeader>
            <CardTitle>站点信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  站点标题
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('site.title') || '')}
                  onChange={(e) => setVal('site.title', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  站点描述
                </label>
                <Textarea
                  className="mt-2"
                  value={String(getVal('site.description') || '')}
                  onChange={(e) => setVal('site.description', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  博主昵称
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('site.ownerName') || '')}
                  onChange={(e) => setVal('site.ownerName', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  每页文章数量
                </label>
                <Input
                  className="mt-2"
                  type="number"
                  value={String(getVal('posts.perPage') ?? 10)}
                  onChange={(e) => setVal('posts.perPage', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  默认主题
                </label>
                <Select
                  value={String(getVal('site.defaultTheme') || 'system')}
                  onValueChange={(v) => setVal('site.defaultTheme', v)}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">浅色</SelectItem>
                    <SelectItem value="dark">深色</SelectItem>
                    <SelectItem value="system">跟随系统</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Logo URL
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input
                    className="sm:flex-1"
                    value={String(getVal('site.logoUrl') || '')}
                    onChange={(e) => setVal('site.logoUrl', e.target.value)}
                  />
                  <ImagePickerDialog
                    title="选择站点 Logo"
                    onSelect={(url) => setVal('site.logoUrl', url)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Favicon URL
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input
                    className="sm:flex-1"
                    value={String(getVal('site.faviconUrl') || '')}
                    onChange={(e) => setVal('site.faviconUrl', e.target.value)}
                  />
                  <ImagePickerDialog
                    title="选择站点 Favicon"
                    onSelect={(url) => setVal('site.faviconUrl', url)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  默认用户头像 URL
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input
                    className="sm:flex-1"
                    value={String(getVal('site.defaultAvatarUrl') || '')}
                    onChange={(e) => setVal('site.defaultAvatarUrl', e.target.value)}
                  />
                  <ImagePickerDialog
                    title="选择默认头像"
                    onSelect={(url) => setVal('site.defaultAvatarUrl', url)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  隐藏管理入口
                </label>
                <select
                  className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                  value={getVal('ui.hideAdminEntry') ? 'true' : 'false'}
                  onChange={(e) => setVal('ui.hideAdminEntry', e.target.value === 'true')}
                >
                  <option value="false">显示</option>
                  <option value="true">隐藏</option>
                </select>
                <p className="text-muted-foreground mt-1 text-xs">
                  隐藏登录入口与登录后头像菜单，可通过关于页头像三击进入后台。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'security' && (
        <Card>
          <CardHeader>
            <CardTitle>管理员账号</CardTitle>
          </CardHeader>
          <CardContent>
            {initialSetup && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-100">
                <p className="font-medium">首次登录请尽快修改管理员账号与密码</p>
                <p className="mt-1">默认账号：admin@example.com / admin123</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  当前邮箱
                </label>
                <Input className="mt-2" value={session?.user?.email || ''} disabled />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  新邮箱（可选）
                </label>
                <Input
                  className="mt-2"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new-admin@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  当前密码
                </label>
                <Input
                  className="mt-2"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="请输入当前密码"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  新密码（可选）
                </label>
                <Input
                  className="mt-2"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少 6 位"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  确认新密码
                </label>
                <Input
                  className="mt-2"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={updateAdminAccount} disabled={accountSaving}>
                {accountSaving ? '更新中...' : '更新管理员账号'}
              </Button>
              <span className="text-muted-foreground text-xs">修改后建议重新登录</span>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'basic' && (
        <Card>
          <CardHeader>
            <CardTitle>首页 Hero</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  打字机内容
                </label>
                <Textarea
                  className="mt-2"
                  rows={4}
                  value={String(getVal('hero.typingTitles') || '')}
                  onChange={(e) => setVal('hero.typingTitles', e.target.value)}
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  每行一条，或使用 | 分隔多条内容。
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  身份/副标题
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('hero.subtitle') || '')}
                  onChange={(e) => setVal('hero.subtitle', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  地址/定位
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('hero.location') || '')}
                  onChange={(e) => setVal('hero.location', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'basic' && (
        <Card>
          <CardHeader>
            <CardTitle>页脚设置</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  备案号 (ICP)
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('site.footer_icp') || '')}
                  onChange={(e) => setVal('site.footer_icp', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  版权信息
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('site.footer_copyright') || '')}
                  onChange={(e) => setVal('site.footer_copyright', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  驱动信息 (Powered By)
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('site.footer_powered_by') || '')}
                  onChange={(e) => setVal('site.footer_powered_by', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'profile' && (
        <Card>
          <CardHeader>
            <CardTitle>个人资料</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  身份属性（侧边栏）
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('profile.tagline') || '')}
                  onChange={(e) => setVal('profile.tagline', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  个性签名
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('profile.signature') || '')}
                  onChange={(e) => setVal('profile.signature', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  身份/职业
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('profile.role') || '')}
                  onChange={(e) => setVal('profile.role', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  地点
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('profile.location') || '')}
                  onChange={(e) => setVal('profile.location', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  加入于（年份）
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('profile.joinedYear') || '')}
                  onChange={(e) => setVal('profile.joinedYear', e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  个人简介
                </label>
                <Textarea
                  className="mt-2"
                  rows={5}
                  value={String(getVal('profile.bio') || '')}
                  onChange={(e) => setVal('profile.bio', e.target.value)}
                />
                <p className="text-muted-foreground mt-1 text-xs">支持换行，将自动分段展示。</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  技术栈
                </label>
                <Textarea
                  className="mt-2"
                  rows={4}
                  value={String(getVal('profile.techStack') || '')}
                  onChange={(e) => setVal('profile.techStack', e.target.value)}
                />
                <p className="text-muted-foreground mt-1 text-xs">示例：前端: React, Next.js</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  兴趣爱好
                </label>
                <Textarea
                  className="mt-2"
                  rows={4}
                  value={String(getVal('profile.hobbies') || '')}
                  onChange={(e) => setVal('profile.hobbies', e.target.value)}
                />
                <p className="text-muted-foreground mt-1 text-xs">每行一个条目，可包含 emoji。</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  联系我说明
                </label>
                <Textarea
                  className="mt-2"
                  rows={3}
                  value={String(getVal('profile.contactIntro') || '')}
                  onChange={(e) => setVal('profile.contactIntro', e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  联系邮箱
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('profile.contactEmail') || '')}
                  onChange={(e) => setVal('profile.contactEmail', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  GitHub 地址
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('profile.contactGithub') || '')}
                  onChange={(e) => setVal('profile.contactGithub', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  X 地址
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('profile.contactX') || '')}
                  onChange={(e) => setVal('profile.contactX', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Bilibili 地址
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('profile.contactBilibili') || '')}
                  onChange={(e) => setVal('profile.contactBilibili', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  QQ 号码
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('profile.contactQQ') || '')}
                  onChange={(e) => setVal('profile.contactQQ', e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  显示 GitHub 链接
                </label>
                <select
                  className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                  value={getBoolVal('profile.social.github.enabled', true) ? 'true' : 'false'}
                  onChange={(e) =>
                    setVal('profile.social.github.enabled', e.target.value === 'true')
                  }
                >
                  <option value="true">显示</option>
                  <option value="false">隐藏</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  显示 X 链接
                </label>
                <select
                  className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                  value={getBoolVal('profile.social.x.enabled', true) ? 'true' : 'false'}
                  onChange={(e) => setVal('profile.social.x.enabled', e.target.value === 'true')}
                >
                  <option value="true">显示</option>
                  <option value="false">隐藏</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  显示 Bilibili 链接
                </label>
                <select
                  className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                  value={getBoolVal('profile.social.bilibili.enabled', true) ? 'true' : 'false'}
                  onChange={(e) =>
                    setVal('profile.social.bilibili.enabled', e.target.value === 'true')
                  }
                >
                  <option value="true">显示</option>
                  <option value="false">隐藏</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  显示邮箱链接
                </label>
                <select
                  className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                  value={getBoolVal('profile.social.email.enabled', true) ? 'true' : 'false'}
                  onChange={(e) =>
                    setVal('profile.social.email.enabled', e.target.value === 'true')
                  }
                >
                  <option value="true">显示</option>
                  <option value="false">隐藏</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  显示 QQ 链接
                </label>
                <select
                  className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                  value={getBoolVal('profile.social.qq.enabled', true) ? 'true' : 'false'}
                  onChange={(e) => setVal('profile.social.qq.enabled', e.target.value === 'true')}
                >
                  <option value="true">显示</option>
                  <option value="false">隐藏</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'interaction' && (
        <Card>
          <CardHeader>
            <CardTitle>评论与注册</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  评论开启
                </label>
                <select
                  className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                  value={getVal('comments.enabled') ? 'true' : 'false'}
                  onChange={(e) => {
                    const enabled = e.target.value === 'true'
                    setVal('comments.enabled', enabled)
                    if (!enabled) {
                      setVal('comments.allowGuest', false)
                    }
                  }}
                >
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  允许未登录评论
                </label>
                <select
                  className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                  value={getVal('comments.allowGuest') ? 'true' : 'false'}
                  onChange={(e) => setVal('comments.allowGuest', e.target.value === 'true')}
                  disabled={!getVal('comments.enabled')}
                >
                  <option value="true">允许</option>
                  <option value="false">禁止</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  游客评论强制审核
                </label>
                <select
                  className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                  value={getVal('comments.guestModerationRequired') ? 'true' : 'false'}
                  onChange={(e) =>
                    setVal('comments.guestModerationRequired', e.target.value === 'true')
                  }
                  disabled={!getVal('comments.enabled') || !getVal('comments.allowGuest')}
                >
                  <option value="true">是</option>
                  <option value="false">否</option>
                </select>
                <p className="text-muted-foreground mt-1 text-xs">
                  若“评论需审核”开启，此项将强制生效。
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  评论需审核
                </label>
                <select
                  className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                  value={getVal('comments.moderationRequired') ? 'true' : 'false'}
                  onChange={(e) => setVal('comments.moderationRequired', e.target.value === 'true')}
                >
                  <option value="true">是</option>
                  <option value="false">否</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  允许用户注册
                </label>
                <select
                  className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                  value={getVal('auth.allowRegistration') ? 'true' : 'false'}
                  onChange={(e) => setVal('auth.allowRegistration', e.target.value === 'true')}
                >
                  <option value="true">允许</option>
                  <option value="false">禁止</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  邮件通知开启
                </label>
                <select
                  className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                  value={getVal('email.enabled') ? 'true' : 'false'}
                  onChange={(e) => setVal('email.enabled', e.target.value === 'true')}
                >
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  回复评论邮件通知
                </label>
                <select
                  className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                  value={
                    (getVal('email.reply.enabled') === '' ? true : getVal('email.reply.enabled'))
                      ? 'true'
                      : 'false'
                  }
                  onChange={(e) => setVal('email.reply.enabled', e.target.value === 'true')}
                  disabled={!getVal('email.enabled')}
                >
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  仅审核通过后通知回复
                </label>
                <select
                  className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                  value={
                    (
                      getVal('email.reply.requireApproved') === ''
                        ? true
                        : getVal('email.reply.requireApproved')
                    )
                      ? 'true'
                      : 'false'
                  }
                  onChange={(e) => setVal('email.reply.requireApproved', e.target.value === 'true')}
                  disabled={!getVal('email.enabled') || !getVal('email.reply.enabled')}
                >
                  <option value="true">是</option>
                  <option value="false">否</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  退订链接
                </label>
                <select
                  className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                  value={
                    (
                      getVal('email.reply.unsubscribeEnabled') === ''
                        ? true
                        : getVal('email.reply.unsubscribeEnabled')
                    )
                      ? 'true'
                      : 'false'
                  }
                  onChange={(e) =>
                    setVal('email.reply.unsubscribeEnabled', e.target.value === 'true')
                  }
                  disabled={!getVal('email.enabled') || !getVal('email.reply.enabled')}
                >
                  <option value="true">开启</option>
                  <option value="false">关闭</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  邮件发件人显示名
                </label>
                <Input
                  className="mt-2"
                  value={String(getVal('email.from') || '')}
                  onChange={(e) => setVal('email.from', e.target.value)}
                  placeholder="PaperGrid 通知"
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  实际发件地址固定使用 SMTP_USER，此项仅用于邮件展示名称。
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  测试邮件
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input id="email-test-title" className="sm:flex-1" placeholder="标题（可空）" />
                  <Input id="email-test-message" className="sm:flex-1" placeholder="消息（可空）" />
                  <Button
                    onClick={async () => {
                      const title = (
                        document.getElementById('email-test-title') as HTMLInputElement
                      )?.value
                      const message = (
                        document.getElementById('email-test-message') as HTMLInputElement
                      )?.value
                      try {
                        const res = await fetch('/api/admin/settings/test-email', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ title, message }),
                        })
                        const data = await res.json()
                        if (res.ok) {
                          toast({
                            title: '成功',
                            description: '测试邮件已发送（若 SMTP 配置正确）',
                          })
                        } else {
                          toast({
                            title: '错误',
                            description: data.error || '发送失败',
                            variant: 'destructive',
                          })
                        }
                      } catch (e) {
                        console.error(e)
                        toast({ title: '错误', description: '发送失败', variant: 'destructive' })
                      }
                    }}
                  >
                    发送测试
                  </Button>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  收件人优先使用环境变量 EMAIL_TO；未配置时会自动发送给管理员邮箱。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'gotify' && (
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Gotify 推送</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    开启 Gotify 推送
                  </label>
                  <select
                    className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                    value={getVal('notifications.gotify.enabled') ? 'true' : 'false'}
                    onChange={(e) =>
                      setVal('notifications.gotify.enabled', e.target.value === 'true')
                    }
                  >
                    <option value="true">开启</option>
                    <option value="false">关闭</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    新评论通知
                  </label>
                  <select
                    className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                    value={getVal('notifications.gotify.notifyNewComment') ? 'true' : 'false'}
                    onChange={(e) =>
                      setVal('notifications.gotify.notifyNewComment', e.target.value === 'true')
                    }
                  >
                    <option value="true">开启</option>
                    <option value="false">关闭</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Gotify URL
                  </label>
                  <Input
                    className="mt-2"
                    value={String(getVal('notifications.gotify.url') || '')}
                    onChange={(e) => setVal('notifications.gotify.url', e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    待审核评论通知
                  </label>
                  <select
                    className="mt-2 w-full rounded border bg-transparent px-3 py-2"
                    value={getVal('notifications.gotify.notifyPendingComment') ? 'true' : 'false'}
                    onChange={(e) =>
                      setVal('notifications.gotify.notifyPendingComment', e.target.value === 'true')
                    }
                  >
                    <option value="true">开启</option>
                    <option value="false">关闭</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Gotify Token
                  </label>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="password"
                      id="gotify-token-input"
                      placeholder="输入或更新 token"
                      className="w-full rounded border bg-transparent px-3 py-2"
                    />
                    <Button
                      onClick={async () => {
                        const el = document.getElementById('gotify-token-input') as HTMLInputElement
                        const token = el?.value
                        if (!token) {
                          toast({
                            title: '错误',
                            description: '请输入 token',
                            variant: 'destructive',
                          })
                          return
                        }

                        try {
                          const res = await fetch('/api/admin/settings/gotify-token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ token }),
                          })
                          const data = await res.json()
                          if (res.ok) {
                            toast({ title: '成功', description: 'Token 已保存' })
                            el.value = ''
                          } else {
                            toast({
                              title: '错误',
                              description: data.error || '保存失败',
                              variant: 'destructive',
                            })
                          }
                        } catch (e) {
                          console.error(e)
                          toast({ title: '错误', description: '保存失败', variant: 'destructive' })
                        }
                      }}
                    >
                      保存 Token
                    </Button>
                  </div>
                  <p className="text-muted-foreground mt-2 text-sm">
                    注意：Token 为 secret，不会在此页面显示。
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    测试推送
                  </label>
                  <div className="mt-2 flex gap-2">
                    <Input id="gotify-test-title" placeholder="标题（可空）" />
                    <Input id="gotify-test-message" placeholder="消息（可空）" />
                    <Button
                      onClick={async () => {
                        const title = (
                          document.getElementById('gotify-test-title') as HTMLInputElement
                        )?.value
                        const message = (
                          document.getElementById('gotify-test-message') as HTMLInputElement
                        )?.value
                        try {
                          const res = await fetch('/api/admin/settings/test-gotify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title, message }),
                          })
                          const data = await res.json()
                          if (res.ok) {
                            toast({ title: '成功', description: '测试推送已发送（若配置正确）' })
                          } else {
                            toast({
                              title: '错误',
                              description: data.error || '推送失败',
                              variant: 'destructive',
                            })
                          }
                        } catch (e) {
                          console.error(e)
                          toast({ title: '错误', description: '推送失败', variant: 'destructive' })
                        }
                      }}
                    >
                      发送测试
                    </Button>
                  </div>
                  <p className="text-muted-foreground mt-2 text-sm">
                    测试推送仅使用服务端配置（环境变量或已保存设置），不会从浏览器传递 Token。
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <small className="text-muted-foreground">
                  你也可以通过设置环境变量 <code>GOTIFY_URL</code> 与 <code>GOTIFY_TOKEN</code>{' '}
                  来覆盖数据库中的配置。
                </small>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {saving ? '保存中...' : '保存设置'}
        </Button>
      </div>

      <AlertDialog open={leaveDialogOpen} onOpenChange={handleLeaveDialogOpenChange}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>离开当前页面？</AlertDialogTitle>
            <AlertDialogDescription>你有未保存的修改，离开后将不会保留。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelLeave}>继续编辑</AlertDialogCancel>
            <AlertDialogAction onClick={continueLeave}>确认离开</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
