'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw, Save } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

type AiSettingsPayload = {
  enabled: boolean
  provider: 'openai-compatible'
  baseUrl: string
  chatModel: string
  embeddingModel: string
  embeddingDimensions: number
  ragTopK: number
  ragMinScore: number
  answerMaxTokens: number
  hasApiKey: boolean
}

type ModelListPayload = {
  baseUrl: string
  chatModels: string[]
  embeddingModels: string[]
}

type IndexStatus = {
  running: boolean
  queueSize: number
  totalPublishedPosts: number
  vectorStats: {
    documentTotal: number
    indexedDocuments: number
    failedDocuments: number
    chunkTotal: number
    queuedDocuments: number
    lastIndexedAt: string | null
  }
  currentTask: {
    id: string
    type: string
    status: string
    postId: string | null
    createdAt: string
    startedAt: string | null
    finishedAt: string | null
    error: string | null
  } | null
  recentTasks: Array<{
    id: string
    type: string
    status: string
    postId: string | null
    createdAt: string
    finishedAt: string | null
    error: string | null
  }>
}

const DEFAULT_SETTINGS: AiSettingsPayload = {
  enabled: false,
  provider: 'openai-compatible',
  baseUrl: '',
  chatModel: 'gpt-4o-mini',
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,
  ragTopK: 8,
  ragMinScore: 0.2,
  answerMaxTokens: 32768,
  hasApiKey: false,
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

export default function AdminAiSettingsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [keySaving, setKeySaving] = useState(false)
  const [modelLoading, setModelLoading] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [settings, setSettings] = useState<AiSettingsPayload>(DEFAULT_SETTINGS)
  const [modelList, setModelList] = useState<ModelListPayload | null>(null)
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null)
  const [indexLoading, setIndexLoading] = useState(false)
  const [rebuildLoading, setRebuildLoading] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/ai/settings', { cache: 'no-store' })
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : '获取 AI 设置失败')
      }

      setSettings({
        enabled: Boolean(data.enabled),
        provider: 'openai-compatible',
        baseUrl: typeof data.baseUrl === 'string' ? data.baseUrl : '',
        chatModel: typeof data.chatModel === 'string' ? data.chatModel : DEFAULT_SETTINGS.chatModel,
        embeddingModel:
          typeof data.embeddingModel === 'string'
            ? data.embeddingModel
            : DEFAULT_SETTINGS.embeddingModel,
        embeddingDimensions:
          typeof data.embeddingDimensions === 'number'
            ? data.embeddingDimensions
            : DEFAULT_SETTINGS.embeddingDimensions,
        ragTopK: typeof data.ragTopK === 'number' ? data.ragTopK : DEFAULT_SETTINGS.ragTopK,
        ragMinScore:
          typeof data.ragMinScore === 'number' ? data.ragMinScore : DEFAULT_SETTINGS.ragMinScore,
        answerMaxTokens:
          typeof data.answerMaxTokens === 'number'
            ? data.answerMaxTokens
            : DEFAULT_SETTINGS.answerMaxTokens,
        hasApiKey: Boolean(data.hasApiKey),
      })
    } catch (error) {
      console.error(error)
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '获取 AI 设置失败',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  const fetchIndexStatus = useCallback(
    async (showLoading = false) => {
      if (showLoading) {
        setIndexLoading(true)
      }

      try {
        const res = await fetch('/api/admin/ai/index/status', { cache: 'no-store' })
        const data = await res.json().catch(() => ({} as Record<string, unknown>))
        if (!res.ok) {
          throw new Error(typeof data.error === 'string' ? data.error : '获取索引状态失败')
        }

        setIndexStatus(data as IndexStatus)
      } catch (error) {
        console.error(error)
        toast({
          title: '错误',
          description: error instanceof Error ? error.message : '获取索引状态失败',
          variant: 'destructive',
        })
      } finally {
        if (showLoading) {
          setIndexLoading(false)
        }
      }
    },
    [toast]
  )

  useEffect(() => {
    if (!settings.enabled) {
      return
    }

    void fetchIndexStatus(true)
    const timer = window.setInterval(() => {
      void fetchIndexStatus(false)
    }, 6000)

    return () => {
      window.clearInterval(timer)
    }
  }, [fetchIndexStatus, settings.enabled])

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      const payload = {
        enabled: settings.enabled,
        provider: 'openai-compatible',
        baseUrl: settings.baseUrl.trim(),
        chatModel: settings.chatModel.trim(),
        embeddingModel: settings.embeddingModel.trim(),
        embeddingDimensions: clampNumber(Math.round(settings.embeddingDimensions), 1, 8192),
        ragTopK: clampNumber(Math.round(settings.ragTopK), 1, 50),
        ragMinScore: clampNumber(settings.ragMinScore, 0, 1),
        answerMaxTokens: clampNumber(Math.round(settings.answerMaxTokens), 1, 262144),
      }

      const res = await fetch('/api/admin/ai/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : '保存失败')
      }

      toast({ title: '成功', description: 'AI 设置已保存' })
      await fetchSettings()
    } catch (error) {
      console.error(error)
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '保存失败',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const saveApiKey = async () => {
    const token = apiKeyInput.trim()
    if (!token) {
      toast({ title: '提示', description: '请输入 API Key', variant: 'destructive' })
      return
    }

    setKeySaving(true)
    try {
      const res = await fetch('/api/admin/ai/settings/openai-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: token }),
      })
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : '保存 API Key 失败')
      }

      toast({ title: '成功', description: 'API Key 已保存' })
      setApiKeyInput('')
      await fetchSettings()
    } catch (error) {
      console.error(error)
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '保存 API Key 失败',
        variant: 'destructive',
      })
    } finally {
      setKeySaving(false)
    }
  }

  const fetchModelList = async () => {
    if (!settings.hasApiKey) {
      toast({ title: '提示', description: '请先保存 API Key', variant: 'destructive' })
      return
    }

    setModelLoading(true)
    try {
      const res = await fetch('/api/admin/ai/models', { cache: 'no-store' })
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : '获取模型列表失败')
      }

      const chatModels = Array.isArray(data.chatModels)
        ? data.chatModels.filter((item: unknown): item is string => typeof item === 'string')
        : []
      const embeddingModels = Array.isArray(data.embeddingModels)
        ? data.embeddingModels.filter((item: unknown): item is string => typeof item === 'string')
        : []
      const baseUrl = typeof data.baseUrl === 'string' ? data.baseUrl : settings.baseUrl

      setModelList({
        baseUrl,
        chatModels,
        embeddingModels,
      })

      if (chatModels.length > 0 && !chatModels.includes(settings.chatModel)) {
        setSettings((prev) => ({ ...prev, chatModel: chatModels[0] }))
      }

      if (embeddingModels.length > 0 && !embeddingModels.includes(settings.embeddingModel)) {
        setSettings((prev) => ({ ...prev, embeddingModel: embeddingModels[0] }))
      }

      toast({ title: '成功', description: '模型列表已更新' })
    } catch (error) {
      console.error(error)
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '获取模型列表失败',
        variant: 'destructive',
      })
    } finally {
      setModelLoading(false)
    }
  }

  const triggerRebuild = async () => {
    setRebuildLoading(true)
    try {
      const res = await fetch('/api/admin/ai/index/rebuild', {
        method: 'POST',
      })
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      if (!res.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : '提交重建任务失败')
      }

      toast({ title: '已提交', description: '全量索引重建任务已进入队列' })
      await fetchIndexStatus(false)
    } catch (error) {
      console.error(error)
      toast({
        title: '错误',
        description: error instanceof Error ? error.message : '提交重建任务失败',
        variant: 'destructive',
      })
    } finally {
      setRebuildLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">AI 设置</h1>
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI 设置</h1>
        <p className="text-muted-foreground">
          当前固定使用单机模式，模型接口采用 OpenAI 兼容协议。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>密钥状态</CardTitle>
          <CardDescription>
            {settings.hasApiKey ? '已设置 API Key（已脱敏）' : '尚未设置 API Key'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="password"
            placeholder="输入或更新 OpenAI 兼容 API Key"
            value={apiKeyInput}
            onChange={(event) => setApiKeyInput(event.target.value)}
          />
          <Button onClick={saveApiKey} disabled={keySaving}>
            {keySaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            保存 API Key
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>模型与检索参数</CardTitle>
          <CardDescription>保存后将用于后台 `/api/admin/ai/chat/stream` 与索引任务。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={saveSettings}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={settings.enabled}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, enabled: event.target.checked }))
                }
              />
              启用 AI 功能
            </label>

            <div className="space-y-3 rounded-md border p-3">
              <div className="text-sm font-medium">自动获取模型列表</div>
              <div className="text-xs text-muted-foreground">
                基于当前 Base URL 调用 `/models`，并自动识别 chat / embedding 模型。
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={fetchModelList}
                  disabled={modelLoading || !settings.hasApiKey}
                >
                  {modelLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  拉取模型列表
                </Button>
                <span className="text-xs text-muted-foreground">
                  {modelList?.baseUrl ? `来源：${modelList.baseUrl}` : '尚未拉取模型列表'}
                </span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Provider</label>
                <Input value={settings.provider} disabled className="mt-2" />
              </div>
              <div>
                <label className="text-sm font-medium">Base URL</label>
                <Input
                  className="mt-2"
                  placeholder="https://api.openai.com/v1"
                  value={settings.baseUrl}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, baseUrl: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Chat Model</label>
                {modelList?.chatModels.length ? (
                  <select
                    className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={settings.chatModel}
                    onChange={(event) =>
                      setSettings((prev) => ({ ...prev, chatModel: event.target.value }))
                    }
                  >
                    {modelList.chatModels.map((modelId) => (
                      <option key={modelId} value={modelId}>
                        {modelId}
                      </option>
                    ))}
                  </select>
                ) : null}
                <Input
                  className="mt-2"
                  value={settings.chatModel}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, chatModel: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Embedding Model</label>
                {modelList?.embeddingModels.length ? (
                  <select
                    className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={settings.embeddingModel}
                    onChange={(event) =>
                      setSettings((prev) => ({ ...prev, embeddingModel: event.target.value }))
                    }
                  >
                    {modelList.embeddingModels.map((modelId) => (
                      <option key={modelId} value={modelId}>
                        {modelId}
                      </option>
                    ))}
                  </select>
                ) : null}
                <Input
                  className="mt-2"
                  value={settings.embeddingModel}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, embeddingModel: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Embedding 维度</label>
                <Input
                  className="mt-2"
                  type="number"
                  min={1}
                  max={8192}
                  value={settings.embeddingDimensions}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      embeddingDimensions: Number(event.target.value || 0),
                    }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">RAG TopK</label>
                <Input
                  className="mt-2"
                  type="number"
                  min={1}
                  max={50}
                  value={settings.ragTopK}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, ragTopK: Number(event.target.value || 0) }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">RAG 最低分数（0~1）</label>
                <Input
                  className="mt-2"
                  type="number"
                  min={0}
                  max={1}
                  step="0.01"
                  value={settings.ragMinScore}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      ragMinScore: Number(event.target.value || 0),
                    }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">回答最大 Token</label>
                <Input
                  className="mt-2"
                  type="number"
                  min={1}
                  max={262144}
                  value={settings.answerMaxTokens}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      answerMaxTokens: Number(event.target.value || 0),
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Save className="mr-2 h-4 w-4" />
                保存设置
              </Button>
              <Button asChild variant="outline">
                <Link href="/admin/ai">返回智能助手</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>索引与任务</CardTitle>
          <CardDescription>索引状态、排队任务和全量重建入口统一放在设置页。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">发布文章</div>
              <div className="text-base font-semibold">{indexStatus?.totalPublishedPosts ?? '-'}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">已索引文档</div>
              <div className="text-base font-semibold">{indexStatus?.vectorStats.indexedDocuments ?? '-'}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">索引片段</div>
              <div className="text-base font-semibold">{indexStatus?.vectorStats.chunkTotal ?? '-'}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">排队任务</div>
              <div className="text-base font-semibold">{indexStatus?.queueSize ?? '-'}</div>
            </div>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <div>运行中：{indexStatus?.running ? '是' : '否'}</div>
            <div>失败文档：{indexStatus?.vectorStats.failedDocuments ?? '-'}</div>
            <div>最后索引：{formatDateTime(indexStatus?.vectorStats.lastIndexedAt || null)}</div>
            {indexStatus?.currentTask ? (
              <div>
                当前任务：{indexStatus.currentTask.type}
                {indexStatus.currentTask.postId ? ` (${indexStatus.currentTask.postId})` : ''}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={triggerRebuild} disabled={rebuildLoading}>
              {rebuildLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              重建全量索引
            </Button>
            <Button variant="outline" onClick={() => fetchIndexStatus(true)} disabled={indexLoading}>
              {indexLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              刷新
            </Button>
          </div>

          {indexStatus?.recentTasks?.length ? (
            <div className="space-y-2 border-t pt-3">
              <div className="text-xs font-medium text-muted-foreground">最近任务</div>
              <div className="max-h-56 space-y-2 overflow-auto">
                {indexStatus.recentTasks.slice(0, 8).map((task) => (
                  <div key={task.id} className="rounded-md border p-2">
                    <div className="font-medium">
                      {task.type}
                      {task.postId ? ` · ${task.postId}` : ''}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      状态：{task.status} · 完成：{formatDateTime(task.finishedAt || task.createdAt)}
                    </div>
                    {task.error ? <div className="text-xs text-red-500">{task.error}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
