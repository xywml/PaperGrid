import { getAiRuntimeSettings } from '@/lib/ai/config'
import {
  streamQaGraph,
  type QaCitation,
  type QaConversationMessage,
} from '@/lib/ai/graph/qa-graph'

export type ChatStreamEvent =
  | { event: 'ready'; data: { ok: true } }
  | { event: 'token'; data: { token: string } }
  | { event: 'reasoning'; data: { text: string } }
  | {
      event: 'tool-call'
      data: {
        toolCallId: string
        toolName: string
        args: Record<string, unknown>
      }
    }
  | {
      event: 'tool-result'
      data: {
        toolCallId: string
        toolName: string
        result: unknown
        isError?: boolean
        citations?: QaCitation[]
      }
    }
  | {
      event: 'done'
      data: {
        answer: string
        citations: QaCitation[]
        model: string
      }
    }

export type StreamAdminAiChatInput = {
  question: string
  includeProtected: boolean
  model?: string
  history: QaConversationMessage[]
  approvedToolKeys: string[]
}

type StreamAdminAiChatOptions = {
  signal?: AbortSignal
  onEvent: (event: ChatStreamEvent) => void
}

const CLIENT_ABORT_ERROR = '__CLIENT_ABORT__'

function assertClientNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error(CLIENT_ABORT_ERROR)
  }
}

export function isClientAbortError(error: unknown) {
  return error instanceof Error && error.message === CLIENT_ABORT_ERROR
}

export async function streamAdminAiChat(
  input: StreamAdminAiChatInput,
  options: StreamAdminAiChatOptions
) {
  const settings = await getAiRuntimeSettings()
  if (!settings.enabled) {
    throw new Error('AI 功能未启用')
  }
  if (!settings.hasApiKey) {
    throw new Error('AI API Key 未配置')
  }

  assertClientNotAborted(options.signal)
  options.onEvent({ event: 'ready', data: { ok: true } })

  const result = await streamQaGraph(
    {
      question: input.question,
      includeProtected: input.includeProtected,
      model: input.model,
      history: input.history,
      approvedToolKeys: input.approvedToolKeys,
    },
    {
      signal: options.signal,
      onToken(token) {
        if (!token) return
        assertClientNotAborted(options.signal)
        options.onEvent({
          event: 'token',
          data: { token },
        })
      },
      onReasoning(payload) {
        assertClientNotAborted(options.signal)
        options.onEvent({
          event: 'reasoning',
          data: payload,
        })
      },
      onToolCall(payload) {
        assertClientNotAborted(options.signal)
        options.onEvent({
          event: 'tool-call',
          data: payload,
        })
      },
      onToolResult(payload) {
        assertClientNotAborted(options.signal)
        options.onEvent({
          event: 'tool-result',
          data: payload,
        })
      },
    }
  )

  assertClientNotAborted(options.signal)
  options.onEvent({
    event: 'done',
    data: {
      answer: result.answer,
      citations: result.citations,
      model: result.model,
    },
  })
}
