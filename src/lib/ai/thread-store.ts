import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'

export type AiThreadMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type AiThreadRecord = {
  id: string
  title: string
  model: string
  createdAt: string
  updatedAt: string
  messages: AiThreadMessage[]
}

const THREAD_KEY_PREFIX = 'ai.thread.'
const DEFAULT_MODEL = 'gpt-4o-mini'

function nowIso() {
  return new Date().toISOString()
}

function buildThreadKey(userId: string, threadId: string) {
  return `${THREAD_KEY_PREFIX}${userId}.${threadId}`
}

function getThreadPrefix(userId: string) {
  return `${THREAD_KEY_PREFIX}${userId}.`
}

function sanitizeMessages(raw: unknown): AiThreadMessage[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const role = (item as { role?: unknown }).role
      const content = (item as { content?: unknown }).content

      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
        return null
      }

      const normalized = content.trim()
      if (!normalized) {
        return null
      }

      return {
        role,
        content: normalized.slice(0, 10000),
      } satisfies AiThreadMessage
    })
    .filter((item): item is AiThreadMessage => Boolean(item))
    .slice(-100)
}

function toThreadRecord(value: unknown, fallback: { id: string; title: string }): AiThreadRecord {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : fallback.id
  const title =
    typeof record.title === 'string' && record.title.trim() ? record.title.trim() : fallback.title
  const model =
    typeof record.model === 'string' && record.model.trim() ? record.model.trim() : DEFAULT_MODEL
  const createdAt =
    typeof record.createdAt === 'string' && record.createdAt.trim()
      ? record.createdAt.trim()
      : nowIso()
  const updatedAt =
    typeof record.updatedAt === 'string' && record.updatedAt.trim()
      ? record.updatedAt.trim()
      : createdAt

  return {
    id,
    title,
    model,
    createdAt,
    updatedAt,
    messages: sanitizeMessages(record.messages),
  }
}

export async function listAiThreads(userId: string) {
  const prefix = getThreadPrefix(userId)
  const rows = await prisma.setting.findMany({
    where: {
      group: 'ai',
      key: {
        startsWith: prefix,
      },
    },
    select: {
      key: true,
      value: true,
      updatedAt: true,
    },
  })

  return rows
    .map((row) => {
      const threadId = row.key.slice(prefix.length)
      if (!threadId) {
        return null
      }

      const thread = toThreadRecord(row.value, {
        id: threadId,
        title: 'New Chat',
      })

      const lastMessage = thread.messages[thread.messages.length - 1]?.content || ''
      return {
        id: thread.id,
        title: thread.title,
        model: thread.model,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        lastMessage,
      }
    })
    .filter(
      (
        item
      ): item is {
        id: string
        title: string
        model: string
        createdAt: string
        updatedAt: string
        lastMessage: string
      } => Boolean(item)
    )
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

export async function getAiThread(userId: string, threadId: string) {
  const id = threadId.trim()
  if (!id) {
    return null
  }

  const row = await prisma.setting.findUnique({
    where: {
      key: buildThreadKey(userId, id),
    },
    select: {
      value: true,
    },
  })

  if (!row) {
    return null
  }

  return toThreadRecord(row.value, {
    id,
    title: 'New Chat',
  })
}

export async function saveAiThread(input: {
  userId: string
  threadId?: string
  title?: string
  model?: string
  messages?: AiThreadMessage[]
}) {
  const threadId = input.threadId?.trim() || crypto.randomUUID()
  const title = input.title?.trim()
  const model = input.model?.trim()
  const timestamp = nowIso()
  const messages = sanitizeMessages(input.messages || [])

  const payload: AiThreadRecord = {
    id: threadId,
    title: title || 'New Chat',
    model: model || DEFAULT_MODEL,
    createdAt: timestamp,
    updatedAt: timestamp,
    messages,
  }

  const key = buildThreadKey(input.userId, threadId)
  const existing = await prisma.setting.findUnique({
    where: { key },
    select: { value: true },
  })

  if (existing) {
    const previous = toThreadRecord(existing.value, {
      id: threadId,
      title: title || 'New Chat',
    })

    payload.createdAt = previous.createdAt
    payload.updatedAt = timestamp
    payload.title = title || previous.title
    payload.model = model || previous.model
  }

  await prisma.setting.upsert({
    where: { key },
    create: {
      key,
      value: payload,
      group: 'ai',
      editable: false,
      secret: false,
      description: 'AI 会话线程数据',
    },
    update: {
      value: payload,
      group: 'ai',
      editable: false,
      secret: false,
      description: 'AI 会话线程数据',
    },
  })

  return payload
}

export async function deleteAiThread(userId: string, threadId: string) {
  const id = threadId.trim()
  if (!id) {
    return false
  }

  const result = await prisma.setting.deleteMany({
    where: {
      key: buildThreadKey(userId, id),
      group: 'ai',
    },
  })

  return result.count > 0
}
