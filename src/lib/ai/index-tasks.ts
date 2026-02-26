import crypto from 'node:crypto'
import { PostStatus } from '@prisma/client'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  deletePostVectorIndex,
  getAiVectorIndexStats,
  indexPostById,
  markPostIndexQueued,
  rebuildAllPostIndex,
} from '@/lib/ai/vector-store'

export type AiIndexTaskType = 'rebuild' | 'post-upsert' | 'post-delete'
export type AiIndexTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export type AiIndexTaskSource = 'manual'

type AiIndexTaskRecord = {
  id: string
  type: AiIndexTaskType
  status: AiIndexTaskStatus
  source: AiIndexTaskSource
  postId: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  requestedBy: string | null
  error: string | null
  result: unknown
}

export type PublicAiIndexTaskRecord = {
  id: string
  type: AiIndexTaskType
  status: AiIndexTaskStatus
  source: AiIndexTaskSource
  postId: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  requestedBy: string | null
  error: string | null
  result: unknown
}

const HISTORY_LIMIT = 80
const TASK_STATE_KEY = 'ai.index.task.state'
const MAX_PENDING_TASKS = 200

type AiIndexTaskStatePayload = {
  queue: AiIndexTaskRecord[]
  history: AiIndexTaskRecord[]
  current: AiIndexTaskRecord | null
  running: boolean
}

const globalForAiIndexTaskQueue = globalThis as typeof globalThis & {
  __papergridAiIndexTaskQueue?: AiIndexTaskRecord[]
  __papergridAiIndexTaskHistory?: AiIndexTaskRecord[]
  __papergridAiIndexTaskCurrent?: AiIndexTaskRecord | null
  __papergridAiIndexTaskRunning?: boolean
  __papergridAiIndexTaskWorker?: Promise<void> | null
  __papergridAiIndexTaskStateLoaded?: boolean
  __papergridAiIndexTaskStateLoading?: Promise<void> | null
}

const taskQueue =
  globalForAiIndexTaskQueue.__papergridAiIndexTaskQueue ||
  (globalForAiIndexTaskQueue.__papergridAiIndexTaskQueue = [])

const taskHistory =
  globalForAiIndexTaskQueue.__papergridAiIndexTaskHistory ||
  (globalForAiIndexTaskQueue.__papergridAiIndexTaskHistory = [])

if (!globalForAiIndexTaskQueue.__papergridAiIndexTaskCurrent) {
  globalForAiIndexTaskQueue.__papergridAiIndexTaskCurrent = null
}

if (globalForAiIndexTaskQueue.__papergridAiIndexTaskRunning === undefined) {
  globalForAiIndexTaskQueue.__papergridAiIndexTaskRunning = false
}

if (!globalForAiIndexTaskQueue.__papergridAiIndexTaskWorker) {
  globalForAiIndexTaskQueue.__papergridAiIndexTaskWorker = null
}

if (globalForAiIndexTaskQueue.__papergridAiIndexTaskStateLoaded === undefined) {
  globalForAiIndexTaskQueue.__papergridAiIndexTaskStateLoaded = false
}

if (!globalForAiIndexTaskQueue.__papergridAiIndexTaskStateLoading) {
  globalForAiIndexTaskQueue.__papergridAiIndexTaskStateLoading = null
}

function nowIso() {
  return new Date().toISOString()
}

function toTaskRecord(value: unknown): AiIndexTaskRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  const type = record.type
  const status = record.status
  const source = record.source
  if (!id) {
    return null
  }

  if (type !== 'rebuild' && type !== 'post-upsert' && type !== 'post-delete') {
    return null
  }

  if (status !== 'pending' && status !== 'running' && status !== 'succeeded' && status !== 'failed') {
    return null
  }

  if (source !== 'manual') {
    return null
  }

  const postId = typeof record.postId === 'string' && record.postId.trim() ? record.postId.trim() : null
  const createdAt =
    typeof record.createdAt === 'string' && record.createdAt.trim() ? record.createdAt.trim() : nowIso()
  const startedAt =
    typeof record.startedAt === 'string' && record.startedAt.trim() ? record.startedAt.trim() : null
  const finishedAt =
    typeof record.finishedAt === 'string' && record.finishedAt.trim() ? record.finishedAt.trim() : null
  const requestedBy =
    typeof record.requestedBy === 'string' && record.requestedBy.trim()
      ? record.requestedBy.trim()
      : null
  const error = typeof record.error === 'string' && record.error.trim() ? record.error.trim() : null

  return {
    id,
    type,
    status,
    source,
    postId,
    createdAt,
    startedAt,
    finishedAt,
    requestedBy,
    error,
    result: Object.prototype.hasOwnProperty.call(record, 'result') ? record.result : null,
  }
}

function parseTaskStatePayload(value: unknown): AiIndexTaskStatePayload {
  if (!value || typeof value !== 'object') {
    return {
      queue: [],
      history: [],
      current: null,
      running: false,
    }
  }

  const payload = value as {
    queue?: unknown
    history?: unknown
    current?: unknown
    running?: unknown
  }

  const queue = Array.isArray(payload.queue)
    ? payload.queue.map((item) => toTaskRecord(item)).filter((item): item is AiIndexTaskRecord => Boolean(item))
    : []

  const history = Array.isArray(payload.history)
    ? payload.history
        .map((item) => toTaskRecord(item))
        .filter((item): item is AiIndexTaskRecord => Boolean(item))
        .slice(0, HISTORY_LIMIT)
    : []

  const current = toTaskRecord(payload.current)
  const running = payload.running === true

  return {
    queue,
    history,
    current,
    running,
  }
}

async function persistTaskState() {
  const snapshot = JSON.parse(
    JSON.stringify({
      queue: taskQueue,
      history: taskHistory,
      current: globalForAiIndexTaskQueue.__papergridAiIndexTaskCurrent ?? null,
      running: Boolean(globalForAiIndexTaskQueue.__papergridAiIndexTaskRunning),
    })
  ) as Prisma.InputJsonValue

  await prisma.setting.upsert({
    where: {
      key: TASK_STATE_KEY,
    },
    create: {
      key: TASK_STATE_KEY,
      value: snapshot,
      group: 'ai',
      editable: false,
      secret: false,
      description: 'AI 索引任务状态快照',
    },
    update: {
      value: snapshot,
      group: 'ai',
      editable: false,
      secret: false,
      description: 'AI 索引任务状态快照',
    },
  })
}

async function ensureTaskStateLoaded() {
  if (globalForAiIndexTaskQueue.__papergridAiIndexTaskStateLoaded) {
    return
  }

  if (globalForAiIndexTaskQueue.__papergridAiIndexTaskStateLoading) {
    await globalForAiIndexTaskQueue.__papergridAiIndexTaskStateLoading
    return
  }

  globalForAiIndexTaskQueue.__papergridAiIndexTaskStateLoading = (async () => {
    const row = await prisma.setting.findUnique({
      where: {
        key: TASK_STATE_KEY,
      },
      select: {
        value: true,
      },
    })

    if (row) {
      const parsed = parseTaskStatePayload(row.value)

      taskQueue.length = 0
      taskQueue.push(...parsed.queue)

      taskHistory.length = 0
      taskHistory.push(...parsed.history)

      if (parsed.current) {
        parsed.current.status = 'pending'
        parsed.current.startedAt = null
        parsed.current.finishedAt = null
        parsed.current.error = null
        taskQueue.unshift(parsed.current)
      }

      globalForAiIndexTaskQueue.__papergridAiIndexTaskCurrent = null
      globalForAiIndexTaskQueue.__papergridAiIndexTaskRunning = false
    }

    globalForAiIndexTaskQueue.__papergridAiIndexTaskStateLoaded = true
  })()

  try {
    await globalForAiIndexTaskQueue.__papergridAiIndexTaskStateLoading
  } finally {
    globalForAiIndexTaskQueue.__papergridAiIndexTaskStateLoading = null
  }
}

function createTaskId() {
  return crypto.randomUUID()
}

function toPublicTask(task: AiIndexTaskRecord): PublicAiIndexTaskRecord {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    source: task.source,
    postId: task.postId,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    requestedBy: task.requestedBy,
    error: task.error,
    result: task.result,
  }
}

function pushHistory(task: AiIndexTaskRecord) {
  taskHistory.unshift(task)
  if (taskHistory.length > HISTORY_LIMIT) {
    taskHistory.length = HISTORY_LIMIT
  }
}

function removePendingPostTasks(postId: string) {
  for (let index = taskQueue.length - 1; index >= 0; index -= 1) {
    const task = taskQueue[index]
    if (task.postId === postId) {
      taskQueue.splice(index, 1)
    }
  }
}

function findPendingRebuildTask() {
  return taskQueue.find((task) => task.type === 'rebuild' && task.status === 'pending') || null
}

function assertQueueCapacity() {
  if (taskQueue.length >= MAX_PENDING_TASKS) {
    throw new Error('任务队列已满，请稍后重试')
  }
}

async function executeTask(task: AiIndexTaskRecord) {
  switch (task.type) {
    case 'rebuild': {
      return rebuildAllPostIndex()
    }
    case 'post-upsert': {
      if (!task.postId) {
        throw new Error('缺少 postId')
      }
      return indexPostById(task.postId)
    }
    case 'post-delete': {
      if (!task.postId) {
        throw new Error('缺少 postId')
      }
      return deletePostVectorIndex(task.postId)
    }
    default: {
      throw new Error('未知任务类型')
    }
  }
}

function ensureWorkerRunning() {
  if (globalForAiIndexTaskQueue.__papergridAiIndexTaskRunning) {
    return
  }

  globalForAiIndexTaskQueue.__papergridAiIndexTaskRunning = true

  globalForAiIndexTaskQueue.__papergridAiIndexTaskWorker = (async () => {
    await persistTaskState()

    while (taskQueue.length > 0) {
      const task = taskQueue.shift()
      if (!task) {
        break
      }

      task.status = 'running'
      task.startedAt = nowIso()
      task.error = null
      globalForAiIndexTaskQueue.__papergridAiIndexTaskCurrent = task
      await persistTaskState()

      try {
        task.result = await executeTask(task)
        task.status = 'succeeded'
      } catch (error) {
        task.status = 'failed'
        task.error = error instanceof Error ? error.message : '索引任务执行失败'
      } finally {
        task.finishedAt = nowIso()
        globalForAiIndexTaskQueue.__papergridAiIndexTaskCurrent = null
        pushHistory({ ...task })
        await persistTaskState()
      }
    }
  })().finally(() => {
    globalForAiIndexTaskQueue.__papergridAiIndexTaskRunning = false
    globalForAiIndexTaskQueue.__papergridAiIndexTaskWorker = null
    void persistTaskState()
    if (taskQueue.length > 0) {
      ensureWorkerRunning()
    }
  })
}

function createTaskRecord(input: {
  type: AiIndexTaskType
  source: AiIndexTaskSource
  postId?: string
  requestedBy?: string | null
}): AiIndexTaskRecord {
  return {
    id: createTaskId(),
    type: input.type,
    status: 'pending',
    source: input.source,
    postId: input.postId || null,
    createdAt: nowIso(),
    startedAt: null,
    finishedAt: null,
    requestedBy: input.requestedBy || null,
    error: null,
    result: null,
  }
}

export async function enqueueRebuildIndexTask(input?: {
  requestedBy?: string | null
}) {
  await ensureTaskStateLoaded()

  const currentTask = globalForAiIndexTaskQueue.__papergridAiIndexTaskCurrent
  if (
    globalForAiIndexTaskQueue.__papergridAiIndexTaskRunning &&
    currentTask &&
    currentTask.type === 'rebuild'
  ) {
    return toPublicTask(currentTask)
  }

  const pendingRebuildTask = findPendingRebuildTask()
  if (pendingRebuildTask) {
    return toPublicTask(pendingRebuildTask)
  }

  assertQueueCapacity()

  const task = createTaskRecord({
    type: 'rebuild',
    source: 'manual',
    requestedBy: input?.requestedBy || null,
  })

  taskQueue.push(task)
  await persistTaskState()
  ensureWorkerRunning()

  return toPublicTask(task)
}

export async function enqueuePostUpsertIndexTask(
  postId: string,
  input?: {
    requestedBy?: string | null
  }
) {
  await ensureTaskStateLoaded()

  const normalizedPostId = postId.trim()
  if (!normalizedPostId) {
    throw new Error('postId 不能为空')
  }

  removePendingPostTasks(normalizedPostId)
  await markPostIndexQueued(normalizedPostId)

  assertQueueCapacity()

  const task = createTaskRecord({
    type: 'post-upsert',
    source: 'manual',
    postId: normalizedPostId,
    requestedBy: input?.requestedBy || null,
  })

  taskQueue.push(task)
  await persistTaskState()
  ensureWorkerRunning()

  return toPublicTask(task)
}

export async function enqueuePostDeleteIndexTask(
  postId: string,
  input?: {
    requestedBy?: string | null
  }
) {
  await ensureTaskStateLoaded()

  const normalizedPostId = postId.trim()
  if (!normalizedPostId) {
    throw new Error('postId 不能为空')
  }

  removePendingPostTasks(normalizedPostId)

  assertQueueCapacity()

  const task = createTaskRecord({
    type: 'post-delete',
    source: 'manual',
    postId: normalizedPostId,
    requestedBy: input?.requestedBy || null,
  })

  taskQueue.push(task)
  await persistTaskState()
  ensureWorkerRunning()

  return toPublicTask(task)
}

export function getRecentAiIndexTasks(limit = 20): PublicAiIndexTaskRecord[] {
  const safeLimit = Math.max(1, Math.min(100, Math.round(limit)))
  return taskHistory.slice(0, safeLimit).map((task) => toPublicTask(task))
}

export async function getAiIndexTaskStatus() {
  await ensureTaskStateLoaded()

  const [vectorStats, totalPublishedPosts] = await Promise.all([
    getAiVectorIndexStats(),
    prisma.post.count({
      where: {
        status: PostStatus.PUBLISHED,
      },
    }),
  ])

  const currentTask = globalForAiIndexTaskQueue.__papergridAiIndexTaskCurrent

  return {
    running: Boolean(globalForAiIndexTaskQueue.__papergridAiIndexTaskRunning),
    queueSize: taskQueue.length,
    totalPublishedPosts,
    vectorStats,
    currentTask: currentTask ? toPublicTask(currentTask) : null,
    recentTasks: getRecentAiIndexTasks(20),
  }
}
