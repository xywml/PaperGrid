import crypto from 'node:crypto'
import path from 'node:path'
import { mkdir, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises'
import { exportBackupData, importBackupData, parseBooleanFlag } from './backup'
import { exportMigrationMarkdownZip, importMigrationMarkdown, type MigrationSource } from './migration'
import { logger } from '@/lib/logger'

export type ImportExportTaskType =
  | 'backup_export'
  | 'backup_import'
  | 'migration_export'
  | 'migration_import'

export type ImportExportTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed'

type TaskOptions = {
  includeSensitive?: boolean
  source?: MigrationSource
}

type TaskRecord = {
  id: string
  type: ImportExportTaskType
  status: ImportExportTaskStatus
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  createdById: string
  options: TaskOptions
  inputFileName: string | null
  inputFilePath: string | null
  outputFileName: string | null
  outputFilePath: string | null
  outputMimeType: string | null
  result: unknown
  error: string | null
}

export type PublicTaskRecord = {
  id: string
  type: ImportExportTaskType
  status: ImportExportTaskStatus
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  options: TaskOptions
  inputFileName: string | null
  outputFileName: string | null
  result: unknown
  error: string | null
  downloadUrl: string | null
}

const TASK_ROOT = path.join('/tmp', 'papergrid-import-export-tasks')
const TASK_DATA_DIR = path.join(TASK_ROOT, 'tasks')
const TASK_FILE_DIR = path.join(TASK_ROOT, 'files')
const MAX_INPUT_BYTES = 50 * 1024 * 1024
const MAX_CONCURRENT_TASKS = 1
const TASK_CLEANUP_INTERVAL_MS = 10 * 60 * 1000
const TASK_FILE_RETENTION_MS = 24 * 60 * 60 * 1000
const TASK_RECORD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const TASK_DIR_MODE = 0o700
const TASK_FILE_MODE = 0o600

const TASK_TYPES = new Set<ImportExportTaskType>([
  'backup_export',
  'backup_import',
  'migration_export',
  'migration_import',
])

const globalForTaskRunner = globalThis as typeof globalThis & {
  __papergridTaskRunningSet?: Set<string>
  __papergridTaskQueue?: string[]
  __papergridTaskLastCleanupAt?: number
  __papergridTaskRecoveryDone?: boolean
  __papergridTaskRecoveryPromise?: Promise<void>
}

const runningTaskSet =
  globalForTaskRunner.__papergridTaskRunningSet ||
  (globalForTaskRunner.__papergridTaskRunningSet = new Set<string>())

const taskQueue =
  globalForTaskRunner.__papergridTaskQueue ||
  (globalForTaskRunner.__papergridTaskQueue = [])

const taskLogger = logger.child({ module: 'import-export-tasks' })

function isTaskType(value: string): value is ImportExportTaskType {
  return TASK_TYPES.has(value as ImportExportTaskType)
}

function nowIso() {
  return new Date().toISOString()
}

function validateTaskId(taskId: string) {
  if (!/^[0-9a-fA-F-]{16,64}$/.test(taskId)) {
    throw new Error('任务 ID 不合法')
  }
}

function taskJsonPath(taskId: string) {
  return path.join(TASK_DATA_DIR, `${taskId}.json`)
}

function taskFilePath(taskId: string, suffix: string) {
  return path.join(TASK_FILE_DIR, `${taskId}-${suffix}`)
}

function sanitizeFileName(input: string) {
  return input.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'file'
}

async function safeUnlink(filePath: string) {
  try {
    await unlink(filePath)
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code !== 'ENOENT') {
      throw error
    }
  }
}

function parseTaskTime(task: TaskRecord): number | null {
  const reference = task.finishedAt || task.createdAt
  const timestamp = Date.parse(reference)
  return Number.isFinite(timestamp) ? timestamp : null
}

async function cleanupExpiredTasks() {
  const now = Date.now()
  const lastCleanupAt = globalForTaskRunner.__papergridTaskLastCleanupAt || 0
  if (now - lastCleanupAt < TASK_CLEANUP_INTERVAL_MS) {
    return
  }
  globalForTaskRunner.__papergridTaskLastCleanupAt = now

  let taskFiles: string[] = []
  try {
    taskFiles = await readdir(TASK_DATA_DIR)
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code !== 'ENOENT') {
      taskLogger.error({ err: error }, '清理历史任务失败')
    }
    return
  }

  for (const fileName of taskFiles) {
    if (!fileName.endsWith('.json')) continue
    const jsonPath = path.join(TASK_DATA_DIR, fileName)

    try {
      const raw = await readFile(jsonPath, 'utf8')
      const task = JSON.parse(raw) as TaskRecord
      if (task.status === 'pending' || task.status === 'running') {
        continue
      }

      const taskTime = parseTaskTime(task)
      if (taskTime === null) {
        continue
      }
      const age = now - taskTime

      if (age > TASK_RECORD_RETENTION_MS) {
        if (task.inputFilePath) {
          await safeUnlink(task.inputFilePath)
        }
        if (task.outputFilePath) {
          await safeUnlink(task.outputFilePath)
        }
        await rm(jsonPath, { force: true })
        continue
      }

      if (age <= TASK_FILE_RETENTION_MS) {
        continue
      }

      let changed = false
      if (task.inputFilePath) {
        await safeUnlink(task.inputFilePath)
        task.inputFilePath = null
        changed = true
      }
      if (task.outputFilePath) {
        await safeUnlink(task.outputFilePath)
        task.outputFilePath = null
        changed = true
      }

      if (changed) {
        await writeFile(jsonPath, JSON.stringify(task, null, 2), {
          encoding: 'utf8',
          mode: TASK_FILE_MODE,
        })
      }
    } catch (error) {
      taskLogger.error({ err: error }, '清理历史任务失败')
    }
  }
}

async function ensureTaskDirs() {
  await mkdir(TASK_DATA_DIR, { recursive: true, mode: TASK_DIR_MODE })
  await mkdir(TASK_FILE_DIR, { recursive: true, mode: TASK_DIR_MODE })
  await recoverUnfinishedTasks()
  void cleanupExpiredTasks().catch((error) => {
    taskLogger.error({ err: error }, '调度历史任务清理失败')
  })
}

function parseCreatedAtTime(task: TaskRecord) {
  const createdAt = Date.parse(task.createdAt)
  return Number.isFinite(createdAt) ? createdAt : null
}

function compareTaskByCreationOrder(a: TaskRecord, b: TaskRecord) {
  const aTime = parseCreatedAtTime(a)
  const bTime = parseCreatedAtTime(b)
  if (aTime !== null && bTime !== null) return aTime - bTime
  if (aTime !== null) return -1
  if (bTime !== null) return 1
  return a.id.localeCompare(b.id)
}

async function recoverUnfinishedTasks() {
  if (globalForTaskRunner.__papergridTaskRecoveryDone) {
    return
  }
  if (globalForTaskRunner.__papergridTaskRecoveryPromise) {
    await globalForTaskRunner.__papergridTaskRecoveryPromise
    return
  }

  globalForTaskRunner.__papergridTaskRecoveryPromise = (async () => {
    let taskFiles: string[] = []
    try {
      taskFiles = await readdir(TASK_DATA_DIR)
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code !== 'ENOENT') {
        taskLogger.error({ err: error }, '恢复未完成任务失败')
      }
      globalForTaskRunner.__papergridTaskRecoveryDone = true
      return
    }

    const resumableTasks: TaskRecord[] = []

    for (const fileName of taskFiles) {
      if (!fileName.endsWith('.json')) continue

      const jsonPath = path.join(TASK_DATA_DIR, fileName)
      try {
        const raw = await readFile(jsonPath, 'utf8')
        const task = JSON.parse(raw) as TaskRecord
        if (!task || typeof task.id !== 'string') continue
        validateTaskId(task.id)
        if (task.status !== 'pending' && task.status !== 'running') continue
        resumableTasks.push(task)
      } catch (error) {
        taskLogger.error({ err: error }, '恢复任务读取失败')
      }
    }

    resumableTasks.sort(compareTaskByCreationOrder)

    for (const task of resumableTasks) {
      if (task.status === 'running') {
        await writeTask({
          ...task,
          status: 'pending',
          startedAt: null,
          finishedAt: null,
          error: null,
        })
      }
      scheduleTaskExecution(task.id)
    }

    globalForTaskRunner.__papergridTaskRecoveryDone = true
  })()

  try {
    await globalForTaskRunner.__papergridTaskRecoveryPromise
  } finally {
    globalForTaskRunner.__papergridTaskRecoveryPromise = undefined
  }
}

function toPublicTask(task: TaskRecord): PublicTaskRecord {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    options: task.options,
    inputFileName: task.inputFileName,
    outputFileName: task.outputFileName,
    result: task.result,
    error: task.error,
    downloadUrl:
      task.status === 'succeeded' && task.outputFilePath
        ? `/api/admin/import-export/tasks/${task.id}/download`
        : null,
  }
}

async function readTask(taskId: string): Promise<TaskRecord> {
  validateTaskId(taskId)
  const raw = await readFile(taskJsonPath(taskId), 'utf8')
  const parsed = JSON.parse(raw) as TaskRecord
  return parsed
}

async function writeTask(task: TaskRecord) {
  await writeFile(taskJsonPath(task.id), JSON.stringify(task, null, 2), {
    encoding: 'utf8',
    mode: TASK_FILE_MODE,
  })
}

async function updateTask(taskId: string, updater: (task: TaskRecord) => TaskRecord | Promise<TaskRecord>) {
  const current = await readTask(taskId)
  const next = await updater(current)
  await writeTask(next)
  return next
}

async function stripInputArtifact(task: TaskRecord): Promise<TaskRecord> {
  if (!task.inputFilePath) {
    return task
  }

  try {
    await safeUnlink(task.inputFilePath)
  } catch (error) {
    taskLogger.error({ err: error, taskId: task.id }, '清理导入文件失败')
    return task
  }

  return {
    ...task,
    inputFilePath: null,
  }
}

async function runBackupExport(task: TaskRecord): Promise<TaskRecord> {
  const includeSensitive = task.options.includeSensitive === true
  const payload = await exportBackupData(includeSensitive)
  const fileName = `papergrid-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const outputPath = taskFilePath(task.id, sanitizeFileName(fileName))
  await writeFile(outputPath, JSON.stringify(payload, null, 2), {
    encoding: 'utf8',
    mode: TASK_FILE_MODE,
  })

  return {
    ...task,
    outputFileName: fileName,
    outputFilePath: outputPath,
    outputMimeType: 'application/json; charset=utf-8',
    result: {
      counts: payload.counts,
      meta: payload.meta,
    },
  }
}

async function runBackupImport(task: TaskRecord): Promise<TaskRecord> {
  if (!task.inputFilePath || !task.inputFileName) {
    throw new Error('缺少导入文件')
  }

  const rawText = await readFile(task.inputFilePath, 'utf8')
  const payload = JSON.parse(rawText) as unknown
  const includeSensitive = task.options.includeSensitive === true
  const result = await importBackupData({
    payload,
    includeSensitive,
    userId: task.createdById,
  })

  return {
    ...task,
    result,
  }
}

async function runMigrationExport(task: TaskRecord): Promise<TaskRecord> {
  const artifact = await exportMigrationMarkdownZip()
  const outputPath = taskFilePath(task.id, sanitizeFileName(artifact.fileName))
  await writeFile(outputPath, artifact.fileBuffer, { mode: TASK_FILE_MODE })

  return {
    ...task,
    outputFileName: artifact.fileName,
    outputFilePath: outputPath,
    outputMimeType: artifact.mimeType,
    result: {
      postCount: artifact.postCount,
    },
  }
}

async function runMigrationImport(task: TaskRecord): Promise<TaskRecord> {
  if (!task.inputFilePath || !task.inputFileName) {
    throw new Error('缺少导入文件')
  }

  const source = task.options.source || 'auto'
  const content = await readFile(task.inputFilePath)
  const result = await importMigrationMarkdown({
    fileName: task.inputFileName,
    fileBuffer: content,
    source,
    userId: task.createdById,
  })

  return {
    ...task,
    result,
  }
}

async function executeTask(taskId: string) {
  if (runningTaskSet.has(taskId)) return
  runningTaskSet.add(taskId)

  try {
    await updateTask(taskId, (task) => ({
      ...task,
      status: 'running',
      startedAt: task.startedAt || nowIso(),
      error: null,
    }))

    let task = await readTask(taskId)

    if (task.type === 'backup_export') {
      task = await runBackupExport(task)
    } else if (task.type === 'backup_import') {
      task = await runBackupImport(task)
    } else if (task.type === 'migration_export') {
      task = await runMigrationExport(task)
    } else if (task.type === 'migration_import') {
      task = await runMigrationImport(task)
    } else {
      throw new Error(`未知任务类型: ${task.type}`)
    }

    task = await stripInputArtifact(task)
    await writeTask({
      ...task,
      status: 'succeeded',
      finishedAt: nowIso(),
      error: null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '任务执行失败'
    await updateTask(taskId, async (task) => {
      const cleanedTask = await stripInputArtifact(task)
      return {
        ...cleanedTask,
        status: 'failed',
        finishedAt: nowIso(),
        error: message,
      }
    })
  } finally {
    runningTaskSet.delete(taskId)
    drainTaskQueue()
  }
}

function drainTaskQueue() {
  while (runningTaskSet.size < MAX_CONCURRENT_TASKS && taskQueue.length > 0) {
    const nextTaskId = taskQueue.shift()
    if (!nextTaskId) continue
    void executeTask(nextTaskId)
  }
}

function scheduleTaskExecution(taskId: string) {
  if (runningTaskSet.has(taskId) || taskQueue.includes(taskId)) {
    return
  }
  taskQueue.push(taskId)
  drainTaskQueue()
}

export async function createTask(input: {
  type: string
  createdById: string
  includeSensitiveRaw?: string | null
  sourceRaw?: string | null
  file?: File | null
}) {
  if (!isTaskType(input.type)) {
    throw new Error('不支持的任务类型')
  }

  await ensureTaskDirs()

  const taskId = crypto.randomUUID()
  const includeSensitive = parseBooleanFlag(input.includeSensitiveRaw)
  const sourceRaw = (input.sourceRaw || '').trim().toLowerCase()
  const source: MigrationSource = sourceRaw === 'hexo' || sourceRaw === 'hugo' ? sourceRaw : 'auto'
  const needInputFile = input.type === 'backup_import' || input.type === 'migration_import'

  let inputFilePath: string | null = null
  let inputFileName: string | null = null

  if (needInputFile) {
    if (!(input.file instanceof File)) {
      throw new Error('导入任务缺少文件')
    }

    if (input.file.size <= 0) {
      throw new Error('导入文件为空')
    }

    if (input.file.size > MAX_INPUT_BYTES) {
      throw new Error('导入文件超过 50MB 限制')
    }

    const fileName = sanitizeFileName(input.file.name || 'input.bin')
    inputFilePath = taskFilePath(taskId, `input-${fileName}`)
    inputFileName = fileName
    const fileBuffer = Buffer.from(await input.file.arrayBuffer())
    await writeFile(inputFilePath, fileBuffer, { mode: TASK_FILE_MODE })
  }

  const task: TaskRecord = {
    id: taskId,
    type: input.type,
    status: 'pending',
    createdAt: nowIso(),
    startedAt: null,
    finishedAt: null,
    createdById: input.createdById,
    options: {
      includeSensitive,
      ...(input.type.startsWith('migration_') ? { source } : {}),
    },
    inputFileName,
    inputFilePath,
    outputFileName: null,
    outputFilePath: null,
    outputMimeType: null,
    result: null,
    error: null,
  }

  await writeTask(task)
  scheduleTaskExecution(task.id)

  return toPublicTask(task)
}

export async function getTask(taskId: string) {
  await ensureTaskDirs()
  const task = await readTask(taskId)
  return toPublicTask(task)
}

export async function getTaskDownload(taskId: string) {
  await ensureTaskDirs()
  const task = await readTask(taskId)

  if (task.status !== 'succeeded' || !task.outputFilePath || !task.outputFileName) {
    throw new Error('任务结果尚不可下载')
  }

  const content = await readFile(task.outputFilePath)
  let taskAfterDownload = task
  try {
    await safeUnlink(task.outputFilePath)
    taskAfterDownload = await updateTask(taskId, (current) => ({
      ...current,
      outputFilePath: null,
    }))
  } catch (error) {
    taskLogger.error({ err: error, taskId }, '清理导出文件失败')
  }

  return {
    task: toPublicTask(taskAfterDownload),
    fileName: task.outputFileName,
    mimeType: task.outputMimeType || 'application/octet-stream',
    content,
  }
}
