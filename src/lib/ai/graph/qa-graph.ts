import { BaseMessage, BaseMessageLike, ToolMessage, coerceMessageLikeToMessage, isBaseMessage } from '@langchain/core/messages'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { getAiRuntimeSettings } from '@/lib/ai/config'
import { createAiChatModel, extractMessageText } from '@/lib/ai/provider'
import { buildAiAgentTools } from '@/lib/ai/tools/registry'

export type QaConversationMessage = {
  role: 'user' | 'assistant'
  content: string
}

type QaGraphInput = {
  question: string
  includeProtected?: boolean
  model?: string
  history?: QaConversationMessage[]
  approvedToolKeys?: string[]
}

export type QaCitation = {
  postId: string
  title: string
  slug: string
  url: string
  snippet: string
  score: number
}

export type QaGraphOutput = {
  answer: string
  citations: QaCitation[]
  model: string
}

export type QaToolCallPayload = {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

export type QaToolResultPayload = {
  toolCallId: string
  toolName: string
  result: unknown
  isError?: boolean
  citations?: QaCitation[]
}

type QaGraphStreamOptions = {
  signal?: AbortSignal
  onToken?: (token: string) => void
  onReasoning?: (payload: { text: string }) => void
  onToolCall?: (payload: QaToolCallPayload) => void
  onToolResult?: (payload: QaToolResultPayload) => void
}

export function buildQaGraphStreamConfig(signal?: AbortSignal) {
  return {
    streamMode: ['messages', 'values'] as Array<'messages' | 'values'>,
    signal,
  }
}

function normalizeHistory(history: QaConversationMessage[]) {
  return history
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .map((item) => ({
      role: item.role,
      content: typeof item.content === 'string' ? item.content.trim() : '',
    }))
    .filter((item) => item.content.length > 0)
}

function parseJsonFromText(input: string): unknown {
  const text = input.trim()
  if (!text) return null

  const candidates: string[] = [text]
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) {
    candidates.push(fenced[1].trim())
  }

  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (objectMatch?.[0]) {
    candidates.push(objectMatch[0].trim())
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      continue
    }
  }

  return null
}

function normalizeCitations(raw: unknown): QaCitation[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const postId =
        typeof (item as { postId?: unknown }).postId === 'string'
          ? (item as { postId: string }).postId
          : ''
      const title =
        typeof (item as { title?: unknown }).title === 'string'
          ? (item as { title: string }).title
          : ''
      const slug =
        typeof (item as { slug?: unknown }).slug === 'string'
          ? (item as { slug: string }).slug
          : ''
      const url =
        typeof (item as { url?: unknown }).url === 'string'
          ? (item as { url: string }).url
          : ''
      const snippet =
        typeof (item as { snippet?: unknown }).snippet === 'string'
          ? (item as { snippet: string }).snippet
          : ''
      const scoreValue = (item as { score?: unknown }).score
      const score = typeof scoreValue === 'number' && Number.isFinite(scoreValue) ? scoreValue : 0

      if (!postId || !title || !url) {
        return null
      }

      return {
        postId,
        title,
        slug,
        url,
        snippet,
        score,
      }
    })
    .filter((item): item is QaCitation => Boolean(item))
}

function mergeCitations(list: QaCitation[]) {
  const map = new Map<string, QaCitation>()

  for (const citation of list) {
    const existing = map.get(citation.postId)
    if (!existing || citation.score > existing.score) {
      map.set(citation.postId, citation)
    }
  }

  return Array.from(map.values()).sort((left, right) => right.score - left.score)
}

function extractToolCitations(messages: BaseMessage[]) {
  const all: QaCitation[] = []

  for (const message of messages) {
    if (!ToolMessage.isInstance(message)) {
      continue
    }

    const content = extractMessageText(message.content)
    if (!content) {
      continue
    }

    const parsed = parseJsonFromText(content)
    if (!parsed || typeof parsed !== 'object') {
      continue
    }

    const citations = normalizeCitations((parsed as { citations?: unknown }).citations)
    if (citations.length > 0) {
      all.push(...citations)
    }
  }

  return mergeCitations(all)
}

function extractFinalAnswer(messages: BaseMessage[], fallback = '') {
  const extractAiMessageContent = (content: unknown) => {
    if (typeof content === 'string') {
      return content
    }

    if (!Array.isArray(content)) {
      return ''
    }

    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (item && typeof item === 'object') {
          const text = (item as { text?: unknown }).text
          if (typeof text === 'string') {
            return text
          }
        }

        return ''
      })
      .join('')
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message._getType() !== 'ai') {
      continue
    }

    const text = extractAiMessageContent((message as { content?: unknown }).content).trim()
    if (text) {
      return text
    }
  }

  const normalizedFallback = fallback.trim()
  if (normalizedFallback) {
    return normalizedFallback
  }

  return '暂未生成有效回复。'
}

function buildAgentPrompt(includeProtected: boolean) {
  return [
    '你是后台 AI 助手，当前阶段仅通过已注册工具完成任务。',
    '针对通用知识或无需站内事实的问题，可直接回答。',
    '当问题涉及站内文章事实、引用、数据或需要可追溯证据时，优先调用工具再回答。',
    '优先使用最小上下文策略：先 query_posts(action=count/list) 获取规模与候选，再 query_posts(action=get) 精读；分类和标签统一用 list_taxonomies；仅在需要语义检索时使用 search_posts。',
    '工具参数必须严格匹配 schema：仅传允许字段、类型正确、枚举值精确匹配，不要携带额外字段。',
    '调用 query_posts(action=get) 时仅在必要场景才开启 includeContent，并设置较小 contentMaxChars（例如 1200-4000）。',
    '若用户只问数量、分类、标签，不要读取正文内容。',
    includeProtected
      ? '当前允许检索受保护文章。'
      : '当前禁止检索受保护文章，不能尝试绕过权限。',
    '当会话禁止受保护文章时，不得请求或推断受保护文章内容。',
    '若工具返回 error 为“approval_required”，应提示用户先批准该工具调用后再继续。',
    '若出现工具参数校验/解析错误，必须立即修正参数并重试同一工具；系统会对此类错误自动重试最多 3 次。',
    '若工具返回 error 为“请先执行向量化”，直接回复“请先执行向量化”。',
    '回答要简洁明确；若使用了检索结果，请附上引用来源；若未检索，请明确说明是通用回答。',
  ].join('\n')
}

function extractMessagesFromStatePayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const rawMessages = (payload as { messages?: unknown }).messages
  if (!Array.isArray(rawMessages)) {
    return []
  }

  const messages: BaseMessage[] = []
  for (const item of rawMessages) {
    if (isBaseMessage(item)) {
      messages.push(item)
      continue
    }

    try {
      messages.push(coerceMessageLikeToMessage(item as BaseMessageLike))
    } catch {
      continue
    }
  }

  return messages
}

function extractTokenFromMessagesPayload(payload: unknown) {
  if (!Array.isArray(payload) || payload.length === 0) {
    return ''
  }

  const first = payload[0]
  if (!first || typeof first !== 'object') {
    return ''
  }

  const message = first as {
    _getType?: () => string
    type?: unknown
    content?: unknown
  }

  const type =
    typeof message._getType === 'function'
      ? message._getType()
      : typeof message.type === 'string'
        ? message.type
        : ''

  if (type !== 'ai') {
    return ''
  }

  // Streaming tokens must keep original whitespace/newlines, otherwise markdown
  // structure (lists/code fences/line breaks) will only appear after final answer replacement.
  const content = message.content
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const text = (item as { text?: unknown }).text
          if (typeof text === 'string') return text
        }
        return ''
      })
      .join('')
  }

  return ''
}

function normalizeReasoningText(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  const normalized = value.trim()
  if (!normalized) {
    return ''
  }

  return normalized.slice(0, 4000)
}

function extractReasoningFromAiMessage(message: BaseMessage) {
  const anyMessage = message as {
    content?: unknown
    additional_kwargs?: Record<string, unknown>
    response_metadata?: Record<string, unknown>
  }

  const result: string[] = []

  if (Array.isArray(anyMessage.content)) {
    for (const part of anyMessage.content) {
      if (!part || typeof part !== 'object') {
        continue
      }

      const typedPart = part as {
        type?: unknown
        text?: unknown
        reasoning?: unknown
        content?: unknown
      }
      const type = typeof typedPart.type === 'string' ? typedPart.type.toLowerCase() : ''
      if (!type || (!type.includes('reasoning') && !type.includes('thinking'))) {
        continue
      }

      const text =
        normalizeReasoningText(typedPart.text) ||
        normalizeReasoningText(typedPart.reasoning) ||
        normalizeReasoningText(typedPart.content)
      if (text) {
        result.push(text)
      }
    }
  }

  const additional = anyMessage.additional_kwargs || {}
  const metadata = anyMessage.response_metadata || {}
  const fallbackCandidates = [
    additional.reasoning,
    additional.reasoning_content,
    metadata.reasoning,
    metadata.reasoning_content,
  ]

  for (const candidate of fallbackCandidates) {
    const text = normalizeReasoningText(candidate)
    if (text) {
      result.push(text)
    }
  }

  return result
}

function toSafeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function extractToolCallsFromAiMessage(message: BaseMessage) {
  const anyMessage = message as {
    tool_calls?: unknown
    additional_kwargs?: Record<string, unknown>
  }
  const rawToolCalls = Array.isArray(anyMessage.tool_calls)
    ? anyMessage.tool_calls
    : Array.isArray(anyMessage.additional_kwargs?.tool_calls)
      ? anyMessage.additional_kwargs?.tool_calls
      : []

  if (!Array.isArray(rawToolCalls) || rawToolCalls.length === 0) {
    return []
  }

  return rawToolCalls
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const call = item as {
        id?: unknown
        name?: unknown
        args?: unknown
        function?: { name?: unknown; arguments?: unknown }
      }

      const toolCallId = typeof call.id === 'string' ? call.id.trim() : ''
      const toolName =
        typeof call.name === 'string'
          ? call.name.trim()
          : typeof call.function?.name === 'string'
            ? call.function.name.trim()
            : ''

      if (!toolCallId || !toolName) {
        return null
      }

      let args: Record<string, unknown> = {}
      if (call.args && typeof call.args === 'object' && !Array.isArray(call.args)) {
        args = call.args as Record<string, unknown>
      } else if (typeof call.function?.arguments === 'string') {
        const parsed = parseJsonFromText(call.function.arguments)
        args = toSafeRecord(parsed)
      }

      return {
        toolCallId,
        toolName,
        args,
      } satisfies QaToolCallPayload
    })
    .filter((item): item is QaToolCallPayload => Boolean(item))
}

function parseToolResultMessage(message: BaseMessage) {
  if (!ToolMessage.isInstance(message)) {
    return null
  }

  const toolMessage = message as ToolMessage & {
    tool_call_id?: unknown
    name?: unknown
    status?: unknown
  }

  const text = extractMessageText(message.content)
  const parsed = text ? parseJsonFromText(text) : null
  const parsedRecord = toSafeRecord(parsed)
  const citations = normalizeCitations(parsedRecord.citations)

  const toolCallId = typeof toolMessage.tool_call_id === 'string' ? toolMessage.tool_call_id : ''
  const toolName =
    typeof toolMessage.name === 'string'
      ? toolMessage.name
      : typeof parsedRecord.toolName === 'string'
        ? parsedRecord.toolName
        : 'tool'

  return {
    toolCallId,
    toolName,
    result: parsed ?? text,
    isError: toolMessage.status === 'error' || parsedRecord.ok === false,
    citations: citations.length ? citations : undefined,
  } satisfies QaToolResultPayload
}

function emitIntermediateStreamEvents(
  messages: BaseMessage[],
  options: QaGraphStreamOptions,
  emittedState: {
    reasoning: Set<string>
    toolCalls: Set<string>
    toolResults: Set<string>
  }
) {
  for (const [index, message] of messages.entries()) {
    const messageType = message._getType()

    if (messageType === 'ai') {
      const reasonings = extractReasoningFromAiMessage(message)
      for (const reasoningText of reasonings) {
        const key = `${index}:${reasoningText}`
        if (emittedState.reasoning.has(key)) {
          continue
        }

        emittedState.reasoning.add(key)
        options.onReasoning?.({ text: reasoningText })
      }

      const toolCalls = extractToolCallsFromAiMessage(message)
      for (const toolCall of toolCalls) {
        const key = `${toolCall.toolCallId}:${toolCall.toolName}`
        if (emittedState.toolCalls.has(key)) {
          continue
        }

        emittedState.toolCalls.add(key)
        options.onToolCall?.(toolCall)
      }
      continue
    }

    if (messageType === 'tool') {
      const toolResult = parseToolResultMessage(message)
      if (!toolResult) {
        continue
      }

      const resultKey = toolResult.toolCallId
        ? `${toolResult.toolCallId}:${toolResult.toolName}`
        : `${index}:${JSON.stringify(toolResult.result)}`

      if (emittedState.toolResults.has(resultKey)) {
        continue
      }

      emittedState.toolResults.add(resultKey)
      options.onToolResult?.(toolResult)
    }
  }
}

async function createQaAgentRuntime(input: QaGraphInput, settings: Awaited<ReturnType<typeof getAiRuntimeSettings>>) {
  const resolvedModel =
    typeof input.model === 'string' && input.model.trim() ? input.model.trim() : settings.chatModel

  const model = await createAiChatModel({
    settings,
    overrides: {
      model: resolvedModel,
    },
  })

  const tools = await buildAiAgentTools({
    includeProtected: input.includeProtected === true,
    ragTopK: settings.ragTopK,
    ragMinScore: settings.ragMinScore,
    approvedToolKeys: new Set((input.approvedToolKeys || []).map((item) => item.trim().toLowerCase())),
  })

  const agent = createReactAgent({
    llm: model,
    tools,
    prompt: buildAgentPrompt(input.includeProtected === true),
  })

  const history = normalizeHistory(input.history || [])
  const question = input.question.trim()
  const messages = [
    ...history.map((item) => ({
      role: item.role,
      content: item.content,
    })),
    {
      role: 'user' as const,
      content: question,
    },
  ]

  return {
    settings,
    resolvedModel,
    agent,
    messages,
  }
}

function assertQaSettingsReady(settings: Awaited<ReturnType<typeof getAiRuntimeSettings>>) {
  if (!settings.enabled) {
    throw new Error('AI 功能未启用')
  }
  if (!settings.hasApiKey) {
    throw new Error('AI API Key 未配置')
  }
}

export async function streamQaGraph(
  input: QaGraphInput,
  options: QaGraphStreamOptions = {}
): Promise<QaGraphOutput> {
  const settings = await getAiRuntimeSettings()
  assertQaSettingsReady(settings)

  const runtime = await createQaAgentRuntime(input, settings)

  const stream = await runtime.agent.stream(
    { messages: runtime.messages },
    buildQaGraphStreamConfig(options.signal)
  )

  let latestMessages: BaseMessage[] = []
  let streamedText = ''
  const emittedState = {
    reasoning: new Set<string>(),
    toolCalls: new Set<string>(),
    toolResults: new Set<string>(),
  }

  for await (const chunk of stream) {
    if (!Array.isArray(chunk) || chunk.length < 2) {
      continue
    }

    const [mode, payload] = chunk as unknown as [unknown, unknown]

    if (mode === 'messages') {
      const token = extractTokenFromMessagesPayload(payload)
      if (token) {
        streamedText += token
        options.onToken?.(token)
      }
      continue
    }

    if (mode === 'values') {
      const messages = extractMessagesFromStatePayload(payload)
      if (messages.length > 0) {
        latestMessages = messages
        emitIntermediateStreamEvents(messages, options, emittedState)
      }
    }
  }

  return {
    answer: extractFinalAnswer(latestMessages, streamedText),
    citations: extractToolCitations(latestMessages),
    model: runtime.resolvedModel,
  }
}
