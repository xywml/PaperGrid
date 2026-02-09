'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

const PERMISSIONS = [
  { value: 'POST_READ', label: '查询文章' },
  { value: 'POST_CREATE', label: '增加文章' },
  { value: 'POST_UPDATE', label: '修改文章' },
  { value: 'POST_DELETE', label: '删除文章' },
]

type ApiKeyRecord = {
  id: string
  name: string
  keyPrefix: string
  createdById: string | null
  permissions: string[]
  enabled: boolean
  lastUsedAt: string | null
  lastUsedIp: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

function formatIsoToDatetimeLocal(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

export default function AdminApiKeysPage() {
  const { toast } = useToast()
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPermissions, setNewPermissions] = useState<string[]>(['POST_READ'])
  const [newExpiresAt, setNewExpiresAt] = useState('')
  const [plainKey, setPlainKey] = useState<string | null>(null)

  const permissionsLabelMap = useMemo(() => {
    return PERMISSIONS.reduce((acc, item) => {
      acc[item.value] = item.label
      return acc
    }, {} as Record<string, string>)
  }, [])

  const fetchApiKeys = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/api-keys')
      const data = await res.json()
      if (res.ok) {
        setApiKeys(data.apiKeys || [])
      } else {
        toast({ title: '错误', description: data.error || '获取 API Key 失败', variant: 'destructive' })
      }
    } catch (error) {
      console.error(error)
      toast({ title: '错误', description: '获取 API Key 失败', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchApiKeys()
  }, [fetchApiKeys])

  const togglePermission = (current: string[], permission: string) => {
    if (current.includes(permission)) {
      return current.filter((p) => p !== permission)
    }
    return [...current, permission]
  }

  const createKey = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          permissions: newPermissions,
          enabled: true,
          expiresAt: newExpiresAt ? new Date(newExpiresAt).toISOString() : null,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setPlainKey(data.plainKey)
        setNewName('')
        setNewPermissions(['POST_READ'])
        setNewExpiresAt('')
        await fetchApiKeys()
        toast({ title: '成功', description: 'API Key 已创建' })
      } else {
        toast({ title: '错误', description: data.error || '创建 API Key 失败', variant: 'destructive' })
      }
    } catch (error) {
      console.error(error)
      toast({ title: '错误', description: '创建 API Key 失败', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  const saveKey = async (key: ApiKeyRecord) => {
    try {
      const res = await fetch(`/api/admin/api-keys/${key.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: key.name,
          permissions: key.permissions,
          enabled: key.enabled,
          expiresAt: key.expiresAt,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setApiKeys((prev) => prev.map((item) => (item.id === key.id ? data.apiKey : item)))
        toast({ title: '成功', description: 'API Key 已更新' })
      } else {
        toast({ title: '错误', description: data.error || '更新失败', variant: 'destructive' })
      }
    } catch (error) {
      console.error(error)
      toast({ title: '错误', description: '更新失败', variant: 'destructive' })
    }
  }

  const deleteKey = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setApiKeys((prev) => prev.filter((item) => item.id !== id))
        toast({ title: '成功', description: 'API Key 已删除' })
      } else {
        toast({ title: '错误', description: data.error || '删除失败', variant: 'destructive' })
      }
    } catch (error) {
      console.error(error)
      toast({ title: '错误', description: '删除失败', variant: 'destructive' })
    }
  }

  const updateKeyState = (id: string, patch: Partial<ApiKeyRecord>) => {
    setApiKeys((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">接口密钥</h1>
        <p className="text-muted-foreground">为插件创建 API Key，并配置文章权限</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>创建新密钥</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">名称</label>
              <Input className="mt-2" placeholder="例如：内容同步插件" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">权限</label>
              <div className="mt-2 flex flex-wrap gap-3">
                {PERMISSIONS.map((perm) => (
                  <label key={perm.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={newPermissions.includes(perm.value)}
                      onChange={() => setNewPermissions((prev) => togglePermission(prev, perm.value))}
                    />
                    {perm.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">过期时间（可选）</label>
              <Input
                className="mt-2"
                type="datetime-local"
                value={newExpiresAt}
                onChange={(e) => setNewExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={createKey} disabled={creating}>
              {creating ? '创建中...' : '生成密钥'}
            </Button>
            <span className="text-xs text-muted-foreground">密钥仅会展示一次，请立即保存</span>
          </div>

          {plainKey && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900 dark:border-yellow-900/50 dark:bg-yellow-900/20 dark:text-yellow-200">
              <div className="font-medium">新密钥已生成：</div>
              <div className="mt-2 break-all font-mono text-xs">{plainKey}</div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(plainKey)
                    toast({ title: '已复制', description: 'API Key 已复制到剪贴板' })
                  }}
                >
                  复制
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPlainKey(null)}>
                  我已保存
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>已创建的密钥</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">加载中...</div>
          ) : apiKeys.length === 0 ? (
            <div className="text-sm text-muted-foreground">暂无 API Key</div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div key={key.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex-1 space-y-3">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block text-xs text-muted-foreground">名称</label>
                          <Input
                            className="mt-1"
                            value={key.name}
                            onChange={(e) => updateKeyState(key.id, { name: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground">密钥前缀</label>
                          <div className="mt-2 text-sm font-mono text-gray-700 dark:text-gray-300">{key.keyPrefix}******</div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground">权限</label>
                        <div className="mt-2 flex flex-wrap gap-3">
                          {PERMISSIONS.map((perm) => (
                            <label key={perm.value} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={key.permissions.includes(perm.value)}
                                onChange={() => updateKeyState(key.id, { permissions: togglePermission(key.permissions, perm.value) })}
                              />
                              {perm.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="grid gap-4 text-xs text-muted-foreground md:grid-cols-2">
                        <div>创建时间：{new Date(key.createdAt).toLocaleString()}</div>
                        <div>最近使用：{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : '未使用'}</div>
                        <div>最近来源 IP：{key.lastUsedIp || '未知'}</div>
                        <div>过期时间：{key.expiresAt ? new Date(key.expiresAt).toLocaleString() : '不过期'}</div>
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground">过期时间（可选）</label>
                        <Input
                          className="mt-1"
                          type="datetime-local"
                          value={formatIsoToDatetimeLocal(key.expiresAt)}
                          onChange={(e) => {
                            const next = e.target.value
                            updateKeyState(key.id, {
                              expiresAt: next ? new Date(next).toISOString() : null,
                            })
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={key.enabled}
                          onChange={() => updateKeyState(key.id, { enabled: !key.enabled })}
                        />
                        启用
                      </label>
                      <Button size="sm" onClick={() => saveKey(key)}>
                        保存
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive">
                            删除
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确认删除</AlertDialogTitle>
                            <AlertDialogDescription>
                              删除后该 API Key 将无法再使用，此操作不可恢复。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteKey(key.id)}>
                              确认删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-muted-foreground">
                    权限摘要：{key.permissions.map((p) => permissionsLabelMap[p] || p).join('、') || '无权限'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
