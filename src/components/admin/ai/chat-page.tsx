'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, Menu, MessageSquarePlus, Settings2, Trash2, X } from 'lucide-react'
import { AdminAiAssistantThread } from '@/components/admin/ai/assistant-thread'
import { Button } from '@/components/ui/button'

type ThreadSummary = {
  id: string
  title: string
  model: string
  createdAt: string
  updatedAt: string
  lastMessage: string
}

type ThreadDetail = {
  id: string
  title: string
  model: string
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
}

type AiSettingsPayload = {
  chatModel: string
  hasApiKey: boolean
}

function normalizeMessages(thread?: ThreadDetail) {
  return Array.isArray(thread?.messages) ? thread.messages : []
}

export function AdminAiChatPage() {
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState('')
  const [initialHistory, setInitialHistory] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [chatModels, setChatModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini')
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)
  const initializedRef = useRef(false)
  const detailRequestIdRef = useRef(0)
  const threadCacheRef = useRef<Record<string, ThreadDetail>>({})

  const fetchSettingsAndModels = useCallback(async () => {
    const settingsRes = await fetch('/api/admin/ai/settings', { cache: 'no-store' })
    const settingsData = (await settingsRes.json().catch(() => ({} as Partial<AiSettingsPayload>))) as Partial<AiSettingsPayload>
    const defaultModel =
      typeof settingsData.chatModel === 'string' && settingsData.chatModel.trim()
        ? settingsData.chatModel.trim()
        : 'gpt-4o-mini'

    setSelectedModel(defaultModel)

    if (!settingsData.hasApiKey) {
      setChatModels([defaultModel])
      return defaultModel
    }

    const modelsRes = await fetch('/api/admin/ai/models', { cache: 'no-store' })
    const modelsData = await modelsRes.json().catch(() => ({} as Record<string, unknown>))
    const fromApi = Array.isArray(modelsData.chatModels)
      ? modelsData.chatModels.filter((item: unknown): item is string => typeof item === 'string')
      : []

    const merged = Array.from(new Set([defaultModel, ...fromApi]))
    setChatModels(merged.length ? merged : [defaultModel])

    return defaultModel
  }, [])

  const fetchThreads = useCallback(async () => {
    const res = await fetch('/api/admin/ai/threads', { cache: 'no-store' })
    const data = await res.json().catch(() => ({ threads: [] as ThreadSummary[] }))
    const list = Array.isArray(data.threads) ? (data.threads as ThreadSummary[]) : []
    setThreads(list)
    return list
  }, [])

  const fetchThreadDetail = useCallback(async (threadId: string) => {
    const id = threadId.trim()
    if (!id) return null

    const res = await fetch(`/api/admin/ai/threads/${encodeURIComponent(id)}`, { cache: 'no-store' })
    if (!res.ok) {
      return null
    }

    const data = await res.json().catch(() => ({} as { thread?: ThreadDetail }))
    const thread = data.thread
    if (!thread) {
      return null
    }

    threadCacheRef.current[thread.id] = thread
    return thread
  }, [])

  const createThread = useCallback(
    async (modelHint: string) => {
      setCreating(true)
      try {
        const res = await fetch('/api/admin/ai/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: 'New Chat',
            model: modelHint,
          }),
        })
        const data = await res.json().catch(() => ({} as { thread?: ThreadDetail }))
        const created = data.thread
        if (!created) return

        threadCacheRef.current[created.id] = created
        await fetchThreads()
        setSelectedThreadId(created.id)
        setInitialHistory([])
        setMobileHistoryOpen(false)
      } finally {
        setCreating(false)
      }
    },
    [fetchThreads]
  )

  const deleteThread = useCallback(
    async (threadId: string) => {
      const id = threadId.trim()
      if (!id) return

      await fetch(`/api/admin/ai/threads/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })

      delete threadCacheRef.current[id]

      const nextThreads = await fetchThreads()
      if (nextThreads.length === 0) {
        await createThread(selectedModel)
        return
      }

      if (selectedThreadId === id) {
        const fallback = nextThreads[0]
        setSelectedThreadId(fallback.id)
      }
    },
    [createThread, fetchThreads, selectedModel, selectedThreadId]
  )

  useEffect(() => {
    if (initializedRef.current) {
      return
    }
    initializedRef.current = true

    void (async () => {
      setLoading(true)
      try {
        const defaultModel = (await fetchSettingsAndModels()) || 'gpt-4o-mini'
        const list = await fetchThreads()
        if (list.length > 0) {
          const first = list[0]
          setSelectedThreadId(first.id)
          return
        }

        await createThread(defaultModel)
      } finally {
        setLoading(false)
      }
    })()
  }, [createThread, fetchSettingsAndModels, fetchThreads])

  useEffect(() => {
    const id = selectedThreadId.trim()
    if (!id) return

    const cached = threadCacheRef.current[id]
    if (cached) {
      setInitialHistory(normalizeMessages(cached))
      if (cached.model?.trim()) {
        const model = cached.model.trim()
        setSelectedModel(model)
        setChatModels((prev) => Array.from(new Set([model, ...prev])))
      }
    } else {
      setInitialHistory([])
    }

    const requestId = ++detailRequestIdRef.current
    void (async () => {
      const thread = await fetchThreadDetail(id)
      if (!thread) return
      if (detailRequestIdRef.current !== requestId) return
      if (selectedThreadId !== thread.id) return

      setInitialHistory(normalizeMessages(thread))
      if (thread.model?.trim()) {
        const model = thread.model.trim()
        setSelectedModel(model)
        setChatModels((prev) => Array.from(new Set([model, ...prev])))
      }
    })()
  }, [fetchThreadDetail, selectedThreadId])

  const handleModelChange = (nextModel: string) => {
    const model = nextModel.trim()
    if (!model || !selectedThreadId) return

    setSelectedModel(model)
    setThreads((prev) =>
      prev.map((item) => (item.id === selectedThreadId ? { ...item, model } : item))
    )

    const existing = threadCacheRef.current[selectedThreadId]
    if (existing) {
      threadCacheRef.current[selectedThreadId] = {
        ...existing,
        model,
      }
    }

    void fetch(`/api/admin/ai/threads/${encodeURIComponent(selectedThreadId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: initialHistory,
      }),
    }).catch(() => {
      // noop
    })
  }

  const handlePersisted = (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    setInitialHistory(messages)

    if (selectedThreadId) {
      const existing = threadCacheRef.current[selectedThreadId]
      threadCacheRef.current[selectedThreadId] = {
        id: selectedThreadId,
        title: existing?.title || 'New Chat',
        model: selectedModel,
        messages,
      }
    }

    const lastMessage = messages[messages.length - 1]?.content || ''
    const updatedAt = new Date().toISOString()

    setThreads((prev) => {
      const next = prev.map((item) =>
        item.id === selectedThreadId
          ? {
              ...item,
              model: selectedModel,
              updatedAt,
              lastMessage,
            }
          : item
      )
      return [...next].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    })
  }

  const selectThread = (threadId: string) => {
    const id = threadId.trim()
    if (!id) return
    setSelectedThreadId(id)

    const cached = threadCacheRef.current[id]
    setInitialHistory(normalizeMessages(cached))
    setMobileHistoryOpen(false)
  }

  if (loading || !selectedThreadId) {
    return (
      <div className="flex h-[calc(100dvh-10rem)] min-h-0 items-center justify-center rounded-xl border bg-background md:min-h-[680px]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="relative h-[calc(100dvh-10rem)] min-h-0 overflow-hidden rounded-xl border bg-background md:min-h-[680px]">
      <div className="flex h-full min-h-0">
        <aside className="hidden w-72 shrink-0 border-r bg-muted/30 p-4 md:flex md:flex-col">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">聊天记录</div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void createThread(selectedModel)}
              disabled={creating}
              aria-label="新建会话"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {threads.map((thread) => {
              const active = thread.id === selectedThreadId
              return (
                <div
                  key={thread.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectThread(thread.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectThread(thread.id)
                    }
                  }}
                  className={`w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors ${
                    active ? 'border-primary/40 bg-background' : 'bg-background/60 hover:bg-background'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{thread.title}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {thread.lastMessage || '暂无消息'}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="删除会话"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation()
                        void deleteThread(thread.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b bg-background px-3 py-2 md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileHistoryOpen((prev) => !prev)}
                aria-label="切换聊天记录"
              >
                <Menu className="h-4 w-4" />
              </Button>

              <div className="min-w-[180px] max-w-[320px]">
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={selectedModel}
                  onChange={(event) => handleModelChange(event.target.value)}
                >
                  {chatModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="md:hidden"
                onClick={() => void createThread(selectedModel)}
                disabled={creating}
                aria-label="新建会话"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
              </Button>

              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/ai/settings">
                  <Settings2 className="mr-2 h-4 w-4" />
                  AI 设置
                </Link>
              </Button>
            </div>
          </div>

          {mobileHistoryOpen ? (
            <div className="fixed inset-0 z-50 flex flex-col bg-background md:hidden">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="text-sm font-medium">聊天记录</div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setMobileHistoryOpen(false)}
                  aria-label="关闭聊天记录"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2">
                {threads.map((thread) => {
                  const active = thread.id === selectedThreadId
                  return (
                    <div
                      key={thread.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectThread(thread.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          selectThread(thread.id)
                        }
                      }}
                      className={`w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors ${
                        active ? 'border-primary/40 bg-background' : 'bg-background/60 hover:bg-background'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{thread.title}</div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {thread.lastMessage || '暂无消息'}
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label="删除会话"
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          onClick={(event) => {
                            event.stopPropagation()
                            void deleteThread(thread.id)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className={`min-h-0 flex-1 p-3 md:p-4 ${mobileHistoryOpen ? 'hidden md:block' : ''}`}>
            <AdminAiAssistantThread
              key={selectedThreadId}
              threadId={selectedThreadId}
              model={selectedModel}
              initialHistory={initialHistory}
              onPersisted={handlePersisted}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
