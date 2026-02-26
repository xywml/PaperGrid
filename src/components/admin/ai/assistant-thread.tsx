'use client'

import { type PropsWithChildren, type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  INTERNAL,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  type ChatModelAdapter,
  type ChatModelRunResult,
  type ReasoningMessagePartComponent,
  type ThreadMessage,
  type TextMessagePartComponent,
  type ToolCallMessagePartComponent,
  useLocalRuntime,
} from '@assistant-ui/react'
import { StreamdownTextPrimitive } from '@assistant-ui/react-streamdown'
import { code as streamdownCode } from '@streamdown/code'
import { math as streamdownMath } from '@streamdown/math'
import { mermaid as streamdownMermaid } from '@streamdown/mermaid'
import { Bot, BrainCog, ChevronRight, SendHorizonal, Square, Wrench } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { iterateSseStream } from '@/lib/ai/chat/sse'
import { isValidHref } from '@/lib/utils'

type AdminAiAssistantThreadProps = {
  includeProtected?: boolean
  threadId: string
  model: string
  initialHistory?: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
  onPersisted?: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => void
}

type ToolCallState = {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  isError?: boolean
}

type RunContentPart = NonNullable<ChatModelRunResult['content']>[number]

type Citation = {
  title: string
  url: string
}
const STREAMDOWN_PLUGINS = {
  code: streamdownCode,
  math: streamdownMath,
  mermaid: streamdownMermaid,
} as const
const SmoothStreamdownTextPrimitive = INTERNAL.withSmoothContextProvider(StreamdownTextPrimitive)

function extractTextFromMessageContent(content: unknown) {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (!Array.isArray(content)) {
    return ''
  }

  const textParts = content
    .map((part) => {
      if (!part || typeof part !== 'object') {
        return ''
      }

      const typed = part as { type?: unknown; text?: unknown }
      if (typed.type !== 'text' || typeof typed.text !== 'string') {
        return ''
      }

      return typed.text
    })
    .filter(Boolean)

  return textParts.join('\n').trim()
}

function buildChatInputFromMessages(messages: readonly ThreadMessage[]) {
  const history = messages
    .map((message) => {
      if (message.role !== 'user' && message.role !== 'assistant') {
        return null
      }

      const content = extractTextFromMessageContent(message.content)
      if (!content) {
        return null
      }

      return {
        role: message.role,
        content,
      } as const
    })
    .filter((item): item is { role: 'user' | 'assistant'; content: string } => Boolean(item))

  const last = history[history.length - 1]
  if (!last || last.role !== 'user') {
    throw new Error('未找到有效提问内容')
  }

  return {
    question: last.content,
    history: history.slice(0, -1),
  }
}

function parseCitations(raw: unknown): Citation[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const citation = item as { title?: unknown; url?: unknown }
      if (typeof citation.title !== 'string' || typeof citation.url !== 'string') {
        return null
      }

      return {
        title: citation.title,
        url: citation.url,
      }
    })
    .filter((item): item is Citation => Boolean(item))
}

function formatCitationsAsMarkdown(citations: Citation[]) {
  if (!citations.length) {
    return ''
  }

  const lines = citations.map((citation, index) => `${index + 1}. [${citation.title}](${citation.url})`)
  return `\n\n---\n### 参考来源\n${lines.join('\n')}`
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function buildRunContent(input: {
  text: string
  reasoningText: string
  toolCalls: Map<string, ToolCallState>
}): ChatModelRunResult {
  const content: RunContentPart[] = []

  if (input.reasoningText) {
    content.push({
      type: 'reasoning',
      text: input.reasoningText,
    } as RunContentPart)
  }

  for (const toolCall of input.toolCalls.values()) {
    const part: Record<string, unknown> = {
      type: 'tool-call',
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      args: toolCall.args,
      argsText: JSON.stringify(toolCall.args),
    }

    if (Object.prototype.hasOwnProperty.call(toolCall, 'result')) {
      part.result = toolCall.result
    }

    if (toolCall.isError) {
      part.isError = true
    }

    content.push(part as unknown as RunContentPart)
  }

  if (input.text) {
    content.push({
      type: 'text',
      text: input.text,
    } as RunContentPart)
  }

  if (content.length === 0) {
    content.push({
      type: 'text',
      text: '',
    } as RunContentPart)
  }

  return { content }
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const TOOL_APPROVAL_EVENT = 'admin-ai-tool-approve'

function dispatchToolApproval(key: string) {
  if (!key.trim()) return
  window.dispatchEvent(new CustomEvent(TOOL_APPROVAL_EVENT, { detail: { key } }))
}

function normalizeRunErrorMessage(message: string) {
  const normalized = message.toLowerCase()
  if (
    normalized.includes('max_tokens') &&
    (normalized.includes('above maximum value') || normalized.includes('expected a value <='))
  ) {
    return '回答最大 Token 超出模型上限，请到 AI 设置将“回答最大 Token”调整到不超过 262144。'
  }

  return message
}

const MarkdownTextPart: TextMessagePartComponent = () => {
  return (
    <SmoothStreamdownTextPrimitive
      plugins={STREAMDOWN_PLUGINS}
      shikiTheme={['github-light', 'github-dark']}
      controls={{
        code: true,
        table: true,
        mermaid: {
          copy: true,
          download: true,
          fullscreen: true,
          panZoom: true,
        },
      }}
      linkSafety={{ enabled: true }}
      containerClassName="min-w-0 text-sm leading-7"
    />
  )
}

const ReasoningPart: ReasoningMessagePartComponent = ({ text }) => {
  if (!text.trim()) {
    return null
  }

  return (
    <div className="space-y-1 text-xs">
      <div className="font-medium text-muted-foreground">思考</div>
      <pre className="whitespace-pre-wrap break-words rounded-md border bg-background/70 p-2 text-xs leading-6 text-muted-foreground">
        {text}
      </pre>
    </div>
  )
}

const ToolFallbackPart: ToolCallMessagePartComponent = ({ toolName, args, result, isError }) => {
  const [approved, setApproved] = useState(false)

  const normalizedArgs = asRecord(args)
  const query = typeof normalizedArgs.query === 'string' ? normalizedArgs.query : ''
  const normalizedResult = asRecord(result)
  const approval = asRecord(normalizedResult.approval)
  const approvalKey = typeof approval.key === 'string' ? approval.key : ''
  const approvalReason = typeof approval.reason === 'string' ? approval.reason : ''
  const approvalRequired = normalizedResult.error === 'approval_required' && Boolean(approvalKey)

  const renderApprovalAction = () => {
    if (!approvalRequired) return null

    return (
      <div className="space-y-1">
        <div className="text-amber-600">{approvalReason || '该工具调用需要审批'}</div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            dispatchToolApproval(approvalKey)
            setApproved(true)
          }}
        >
          {approved ? '已批准（下次请求生效）' : '批准该工具调用'}
        </Button>
      </div>
    )
  }

  if (toolName === 'search_posts') {
    const citations = parseCitations(normalizedResult.citations)

    return (
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <Wrench className="h-3.5 w-3.5" />
          工具调用: search_posts
        </div>
        {query ? <div className="text-muted-foreground">query: {query}</div> : null}
        {renderApprovalAction()}
        {isError === true && !approvalRequired ? (
          <div className="text-red-500">{String(normalizedResult.error || '工具执行失败')}</div>
        ) : typeof result === 'undefined' ? (
          <div className="text-muted-foreground">工具执行中...</div>
        ) : !approvalRequired ? (
          citations.length > 0 ? (
            <div className="space-y-1 rounded-md border bg-background/70 p-2">
              {citations.slice(0, 6).map((citation) => {
                const safeHref = isValidHref(citation.url) ? citation.url : undefined
                return (
                  <div key={`${citation.url}-${citation.title}`}>
                    {safeHref ? (
                      <a href={safeHref} target="_blank" rel="noreferrer noopener" className="underline">
                        {citation.title}
                      </a>
                    ) : (
                      <span>{citation.title}</span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-muted-foreground">无命中结果</div>
          )
        ) : (
          <div className="text-muted-foreground">等待审批后重试</div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-1.5 font-medium">
        <Wrench className="h-3.5 w-3.5" />
        工具调用: {typeof toolName === 'string' ? toolName : 'unknown'}
      </div>
      {renderApprovalAction()}
      {isError === true && !approvalRequired ? (
        <div className="text-red-500">执行失败</div>
      ) : typeof result === 'undefined' ? (
        <div className="text-muted-foreground">工具执行中...</div>
      ) : approvalRequired ? (
        <div className="text-muted-foreground">等待审批后重试</div>
      ) : (
        <pre className="overflow-x-auto rounded-md border bg-background/80 p-2 text-xs leading-6">
          {stringifyJson(result)}
        </pre>
      )}
    </div>
  )
}

function CollapsiblePartGroup({
  icon,
  label,
  defaultCollapsed,
  children,
}: PropsWithChildren<{
  icon: ReactNode
  label: string
  defaultCollapsed: boolean
}>) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <div className="mb-3 overflow-hidden rounded-lg border bg-muted/30">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50"
        onClick={() => setCollapsed((value) => !value)}
      >
        {icon}
        <span>
          {label}
          （点击{collapsed ? '展开' : '折叠'}）
        </span>
        <ChevronRight className={`ml-auto h-3.5 w-3.5 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
      </button>
      {collapsed ? null : <div className="[&>*+*]:border-t [&>*]:px-3 [&>*]:py-2">{children}</div>}
    </div>
  )
}

function ReasoningGroup({
  startIndex,
  endIndex,
  children,
}: PropsWithChildren<{ startIndex: number; endIndex: number }>) {
  const reasoningCount = endIndex - startIndex + 1
  const label = reasoningCount > 1 ? `思考（${reasoningCount}段）` : '思考'

  return (
    <CollapsiblePartGroup icon={<BrainCog className="h-3.5 w-3.5" />} label={label} defaultCollapsed={false}>
      {children}
    </CollapsiblePartGroup>
  )
}

function ToolGroup({
  startIndex,
  endIndex,
  children,
}: PropsWithChildren<{ startIndex: number; endIndex: number }>) {
  const toolCount = endIndex - startIndex + 1
  const label = toolCount > 1 ? `工具调用（${toolCount}次）` : '工具调用'

  return (
    <CollapsiblePartGroup icon={<Wrench className="h-3.5 w-3.5" />} label={label} defaultCollapsed>
      {children}
    </CollapsiblePartGroup>
  )
}

function UserMessage({ avatarUrl }: { avatarUrl?: string }) {
  return (
    <MessagePrimitive.Root className="flex items-start justify-end gap-3 py-1.5">
      <div className="max-w-[min(88%,52rem)] rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground">
        <MessagePrimitive.Parts components={{ Text: MarkdownTextPart }} />
      </div>
      <Avatar className="h-8 w-8 shrink-0 border bg-primary/10">
        <AvatarImage src={avatarUrl || undefined} alt="用户头像" />
        <AvatarFallback className="text-xs font-semibold">你</AvatarFallback>
      </Avatar>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex items-start gap-3 py-1.5">
      <Avatar className="h-8 w-8 shrink-0 border bg-background">
        <AvatarFallback className="text-xs font-semibold">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="max-w-[min(90%,52rem)] rounded-2xl border bg-background px-4 py-3 text-sm shadow-sm">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownTextPart,
            Reasoning: ReasoningPart,
            ReasoningGroup,
            ToolGroup,
            tools: {
              Fallback: ToolFallbackPart,
            },
          }}
        />
        <MessagePrimitive.Error>
          <div className="mt-2 text-xs text-red-500">请求失败，请稍后重试。</div>
        </MessagePrimitive.Error>
      </div>
    </MessagePrimitive.Root>
  )
}

function Composer() {
  const isRunning = useAuiState((state) => state.thread.isRunning)

  return (
    <ComposerPrimitive.Root className="space-y-3 rounded-2xl border bg-background p-3 shadow-sm">
      <ComposerPrimitive.Input
        className="min-h-[88px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        placeholder="Send a message..."
        submitMode="enter"
      />
      <div className="flex items-center justify-end">
        {isRunning ? (
          <ComposerPrimitive.Cancel asChild>
            <Button type="button" variant="outline" size="icon" aria-label="停止">
              <Square className="h-4 w-4" />
            </Button>
          </ComposerPrimitive.Cancel>
        ) : (
          <ComposerPrimitive.Send asChild>
            <Button type="button" size="icon" aria-label="发送">
              <SendHorizonal className="h-4 w-4" />
            </Button>
          </ComposerPrimitive.Send>
        )}
      </div>
    </ComposerPrimitive.Root>
  )
}

function AssistantThread({ userAvatarUrl }: { userAvatarUrl?: string }) {
  const UserMessageWithAvatar = () => <UserMessage avatarUrl={userAvatarUrl} />

  return (
    <ThreadPrimitive.Root className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-xl border bg-background">
      <ThreadPrimitive.Viewport className="flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4 md:p-6">
        <ThreadPrimitive.Empty>
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-2 pb-10 pt-6 text-center">
            <h2 className="text-4xl font-semibold tracking-tight">你好！</h2>
            <p className="mt-2 text-2xl text-muted-foreground">今天我可以帮你做些什么？</p>

            <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
              <ThreadPrimitive.Suggestion
                prompt="帮我找一下和 Linux 相关的文章？"
                send
                className="rounded-2xl border bg-background px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted/60"
              >
                <div className="text-base font-medium">帮我找一下和 Linux</div>
                <div className="text-base text-muted-foreground">相关的文章？</div>
              </ThreadPrimitive.Suggestion>
              <ThreadPrimitive.Suggestion
                prompt="解释一下 AOP 思想在 Gin 中的应用"
                send
                className="rounded-2xl border bg-background px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted/60"
              >
                <div className="text-base font-medium">解释一下 AOP 思想</div>
                <div className="text-base text-muted-foreground">在 Gin 中的应用</div>
              </ThreadPrimitive.Suggestion>
            </div>
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage: UserMessageWithAvatar,
            AssistantMessage,
          }}
        />
      </ThreadPrimitive.Viewport>
      <div className="border-t bg-background p-4 md:px-6 md:pb-6">
        <Composer />
      </div>
    </ThreadPrimitive.Root>
  )
}

function toInitialThreadMessages(
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): ThreadMessage[] {
  return history
    .map((item) => {
      const content = item.content.trim()
      if (!content) {
        return null
      }

      return {
        role: item.role,
        content: [
          {
            type: 'text',
            text: content,
          },
        ],
      } as unknown as ThreadMessage
    })
    .filter((item): item is ThreadMessage => Boolean(item))
}

export function AdminAiAssistantThread({
  includeProtected = false,
  threadId,
  model,
  initialHistory = [],
  onPersisted,
}: AdminAiAssistantThreadProps) {
  const safeThreadId = threadId.trim()
  const initialMessages = useMemo(() => toInitialThreadMessages(initialHistory), [initialHistory])
  const [approvedToolKeys, setApprovedToolKeys] = useState<string[]>([])
  const [defaultAvatarUrl, setDefaultAvatarUrl] = useState('')

  useEffect(() => {
    setApprovedToolKeys([])
  }, [safeThreadId])

  useEffect(() => {
    let active = true

    void fetch('/api/settings/public', { cache: 'no-store' })
      .then((res) => res.json().catch(() => ({} as Record<string, unknown>)))
      .then((data: unknown) => {
        if (!active || !data || typeof data !== 'object') {
          return
        }

        const value = (data as Record<string, unknown>)['site.defaultAvatarUrl']
        setDefaultAvatarUrl(typeof value === 'string' ? value.trim() : '')
      })
      .catch(() => {
        if (active) {
          setDefaultAvatarUrl('')
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const onApprove = (event: Event) => {
      const customEvent = event as CustomEvent<{ key?: unknown }>
      const key =
        customEvent.detail && typeof customEvent.detail.key === 'string'
          ? customEvent.detail.key.trim().toLowerCase()
          : ''
      if (!/^[a-f0-9]{64}$/.test(key)) {
        return
      }

      setApprovedToolKeys((prev) => {
        if (prev.includes(key)) {
          return prev
        }
        return [...prev, key].slice(-200)
      })
    }

    window.addEventListener(TOOL_APPROVAL_EVENT, onApprove)
    return () => {
      window.removeEventListener(TOOL_APPROVAL_EVENT, onApprove)
    }
  }, [])

  const modelAdapter = useMemo<ChatModelAdapter>(
    () => ({
      async *run({ messages, abortSignal }) {
        const input = buildChatInputFromMessages(messages)
        const response = await fetch('/api/admin/ai/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: input.question,
            history: input.history,
            includeProtected,
            model,
            approvedToolKeys,
          }),
          signal: abortSignal,
        })

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null)
          const message =
            errorPayload &&
            typeof errorPayload === 'object' &&
            typeof (errorPayload as { error?: unknown }).error === 'string'
              ? (errorPayload as { error: string }).error
              : 'AI 对话失败'
          throw new Error(normalizeRunErrorMessage(message))
        }

        if (!response.body) {
          throw new Error('流式响应不可用')
        }

        let text = ''
        let reasoningText = ''
        let completed = false
        const toolCalls = new Map<string, ToolCallState>()

        for await (const event of iterateSseStream(response.body)) {
          const data = asRecord(event.data)

          if (event.event === 'token') {
            const token = typeof data.token === 'string' ? data.token : ''
            if (!token) continue
            text += token
            yield buildRunContent({
              text,
              reasoningText,
              toolCalls,
            })
            continue
          }

          if (event.event === 'reasoning') {
            const reasoning = typeof data.text === 'string' ? data.text.trim() : ''
            if (!reasoning) continue
            reasoningText = reasoningText ? `${reasoningText}\n${reasoning}` : reasoning
            yield buildRunContent({
              text,
              reasoningText,
              toolCalls,
            })
            continue
          }

          if (event.event === 'tool-call') {
            const toolCallId = typeof data.toolCallId === 'string' ? data.toolCallId : ''
            const toolName = typeof data.toolName === 'string' ? data.toolName : 'tool'
            if (!toolCallId) continue
            const existing = toolCalls.get(toolCallId)
            toolCalls.set(toolCallId, {
              toolCallId,
              toolName,
              args: asRecord(data.args),
              result: existing?.result,
              isError: existing?.isError,
            })
            yield buildRunContent({
              text,
              reasoningText,
              toolCalls,
            })
            continue
          }

          if (event.event === 'tool-result') {
            const toolCallId = typeof data.toolCallId === 'string' ? data.toolCallId : ''
            const toolName = typeof data.toolName === 'string' ? data.toolName : 'tool'
            const fallbackId = toolCallId || `${toolName}-${toolCalls.size + 1}`
            const existing = toolCalls.get(fallbackId)
            toolCalls.set(fallbackId, {
              toolCallId: fallbackId,
              toolName,
              args: existing?.args || {},
              result: Object.prototype.hasOwnProperty.call(data, 'result')
                ? data.result
                : existing?.result,
              isError:
                data.isError === true
                  ? true
                  : data.isError === false
                    ? false
                    : existing?.isError,
            })
            yield buildRunContent({
              text,
              reasoningText,
              toolCalls,
            })
            continue
          }

          if (event.event === 'done') {
            completed = true
            const answer = typeof data.answer === 'string' ? data.answer.trim() : ''
            const citations = parseCitations(data.citations)
            text = answer || text
            text += formatCitationsAsMarkdown(citations)

            const persistedMessages = [
              ...input.history,
              {
                role: 'user' as const,
                content: input.question,
              },
              {
                role: 'assistant' as const,
                content: text,
              },
            ]

            if (safeThreadId) {
              void fetch(`/api/admin/ai/threads/${encodeURIComponent(safeThreadId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model,
                  messages: persistedMessages,
                }),
              }).catch(() => {
                // noop
              })
            }
            onPersisted?.(persistedMessages)

            yield buildRunContent({
              text,
              reasoningText,
              toolCalls,
            })
            break
          }

          if (event.event === 'error') {
            const message = typeof data.error === 'string' ? data.error : 'AI 对话失败'
            throw new Error(normalizeRunErrorMessage(message))
          }
        }

        if (!completed && !text.trim()) {
          throw new Error('流式响应提前结束')
        }
      },
    }),
    [approvedToolKeys, includeProtected, model, onPersisted, safeThreadId]
  )

  const runtime = useLocalRuntime(modelAdapter, {
    initialMessages,
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantThread userAvatarUrl={defaultAvatarUrl || undefined} />
    </AssistantRuntimeProvider>
  )
}
