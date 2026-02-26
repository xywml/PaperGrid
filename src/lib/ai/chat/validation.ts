export type ChatConversationMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ChatRequestInput = {
  question: string
  includeProtected: boolean
  model?: string
  history: ChatConversationMessage[]
  approvedToolKeys: string[]
}

type ChatRequestBody = {
  question?: unknown
  includeProtected?: unknown
  model?: unknown
  history?: unknown
  approvedToolKeys?: unknown
}

function normalizeApprovedToolKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
    .filter((item) => /^[a-f0-9]{64}$/.test(item))
    .slice(-200)
}

function normalizeHistory(rawHistory: unknown): ChatConversationMessage[] {
  if (!Array.isArray(rawHistory)) {
    return []
  }

  return rawHistory
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const role = (item as { role?: unknown }).role
      const content = (item as { content?: unknown }).content
      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
        return null
      }

      const trimmed = content.trim()
      if (!trimmed) {
        return null
      }

      return {
        role,
        content: trimmed.slice(0, 2000),
      }
    })
    .filter((item): item is ChatConversationMessage => Boolean(item))
    .slice(-12)
}

export function normalizeChatRequestBody(raw: unknown): ChatRequestInput {
  const body = (raw || {}) as ChatRequestBody
  const question = typeof body.question === 'string' ? body.question.trim() : ''

  if (question.length < 1) {
    throw new Error('问题至少 1 个字符')
  }

  if (question.length > 1000) {
    throw new Error('问题内容过长')
  }

  return {
    question,
    includeProtected: body.includeProtected === true,
    model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined,
    history: normalizeHistory(body.history),
    approvedToolKeys: normalizeApprovedToolKeys(body.approvedToolKeys),
  }
}
