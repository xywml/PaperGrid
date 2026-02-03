'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Loader2 } from 'lucide-react'

type Setting = {
  key: string
  value: any
}

type MobileReadingBackground = 'grid' | 'card'

const DEFAULT_BACKGROUND: MobileReadingBackground = 'grid'

export default function AdminStylesPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mobileReadingBackground, setMobileReadingBackground] = useState<MobileReadingBackground>(DEFAULT_BACKGROUND)
  const { toast } = useToast()

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (res.ok) {
        const setting = (data.settings || []).find((it: Setting) => it.key === 'ui.mobileReadingBackground')
        const rawVal = setting?.value ? Object.values(setting.value)[0] : DEFAULT_BACKGROUND
        setMobileReadingBackground(rawVal === 'card' ? 'card' : DEFAULT_BACKGROUND)
      } else {
        toast({ title: '错误', description: data.error || '获取样式设置失败', variant: 'destructive' })
      }
    } catch (e) {
      console.error(e)
      toast({ title: '错误', description: '获取样式设置失败', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ key: 'ui.mobileReadingBackground', value: { style: mobileReadingBackground } }],
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast({ title: '成功', description: '样式设置已保存' })
        fetchSettings()
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">样式管理</h1>
        <p className="text-muted-foreground">管理阅读页的视觉样式</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>移动端阅读背景</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">阅读背景</label>
              <Select
                value={mobileReadingBackground}
                onValueChange={(value) => setMobileReadingBackground((value === 'card' ? 'card' : DEFAULT_BACKGROUND))}
                disabled={loading}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">纯色方块</SelectItem>
                  <SelectItem value="grid">田字方格</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-muted-foreground">
                仅影响移动端文章阅读页的正文背景样式。
              </p>
            </div>
            <div className="flex items-center justify-end">
              <Button onClick={save} disabled={saving || loading}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存设置
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
