import crypto from 'node:crypto'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PostStatus } from '@prisma/client'
import * as sqliteVec from 'sqlite-vec'
import { AI_DEFAULTS, type AiRuntimeSettings, getAiRuntimeSettings } from '@/lib/ai/config'
import { runOpenAiCompatibleEmbeddings } from '@/lib/ai/provider'
import { prisma } from '@/lib/prisma'

const VECTOR_META_KEY = 'embedding_dimensions'
const MAX_CHUNK_CHARS = 1200
const CHUNK_OVERLAP_CHARS = 160

type SqliteRow = Record<string, unknown>

type SqliteStatement = {
  run: (...params: unknown[]) => unknown
  get: (...params: unknown[]) => SqliteRow | undefined
  all: (...params: unknown[]) => SqliteRow[]
}

type VectorDatabase = {
  exec: (sql: string) => void
  prepare: (sql: string) => SqliteStatement
  close: () => void
  loadExtension: (file: string, entrypoint?: string | undefined) => void
}

type DatabaseSyncCtor = new (
  path: string,
  options?: {
    allowExtension?: boolean
  }
) => VectorDatabase

type OpenVectorDatabaseOptions = {
  dimensions?: number
  resetOnDimensionMismatch?: boolean
}

type OpenVectorDatabaseResult = {
  db: VectorDatabase
  dimension: number
}

type IndexablePost = {
  id: string
  title: string
  content: string
  excerpt: string | null
  status: PostStatus
}

type BuiltChunk = {
  chunkIndex: number
  content: string
  embeddingInput: string
}

export type AiVectorSearchHit = {
  chunkId: string
  postId: string
  chunkIndex: number
  content: string
  distance: number
  score: number
}

export type AiPostIndexResult = {
  postId: string
  status: 'indexed' | 'unchanged' | 'deleted' | 'skipped'
  chunkCount: number
  reason?: string
}

export type AiRebuildIndexResult = {
  totalPublishedPosts: number
  indexed: number
  unchanged: number
  deleted: number
  failed: number
  errors: Array<{
    postId: string
    error: string
  }>
}

export type AiVectorIndexStats = {
  documentTotal: number
  indexedDocuments: number
  failedDocuments: number
  chunkTotal: number
  queuedDocuments: number
  lastIndexedAt: string | null
}

export type AiVectorIndexReadiness = {
  ready: boolean
  reason: string | null
}

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0
}

function sanitizeDimension(value: number, fallback: number) {
  const rounded = Math.round(value)
  return isPositiveInteger(rounded) ? rounded : fallback
}

function toStringOrEmpty(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function toNumberOrZero(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function resolveRebuildConcurrency() {
  const raw = Number.parseInt(process.env.AI_INDEX_REBUILD_CONCURRENCY || '', 10)
  if (!Number.isFinite(raw)) {
    return 1
  }

  return clamp(raw, 1, 2)
}

function normalizeDatabaseUrl(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    return ''
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

function resolveSqliteDatabasePath() {
  const rawUrl = normalizeDatabaseUrl(process.env.DATABASE_URL || '')
  if (!rawUrl) {
    return path.resolve(process.cwd(), 'prisma', 'dev.db')
  }

  if (!rawUrl.startsWith('file:')) {
    throw new Error('当前仅支持 SQLite（DATABASE_URL 需以 file: 开头）')
  }

  const withoutProtocol = rawUrl.slice('file:'.length)
  const [rawPathPart] = withoutProtocol.split('?')
  const decodedPath = decodeURIComponent(rawPathPart || '').trim()

  if (!decodedPath || decodedPath === ':memory:') {
    throw new Error('向量索引不支持内存数据库')
  }

  if (path.isAbsolute(decodedPath)) {
    return decodedPath
  }

  const rootResolved = path.resolve(process.cwd(), decodedPath)
  const prismaResolved = path.resolve(process.cwd(), 'prisma', decodedPath)

  if (existsSync(prismaResolved)) {
    return prismaResolved
  }

  if (existsSync(rootResolved)) {
    return rootResolved
  }

  return prismaResolved
}

function resolveSqliteVecPackageName() {
  if (process.platform === 'linux') {
    if (process.arch === 'x64') return 'sqlite-vec-linux-x64'
    if (process.arch === 'arm64') return 'sqlite-vec-linux-arm64'
  }

  if (process.platform === 'darwin') {
    if (process.arch === 'x64') return 'sqlite-vec-darwin-x64'
    if (process.arch === 'arm64') return 'sqlite-vec-darwin-arm64'
  }

  if (process.platform === 'win32') {
    if (process.arch === 'x64') return 'sqlite-vec-windows-x64'
  }

  return null
}

function resolveSqliteVecExtensionSuffix() {
  if (process.platform === 'win32') return 'dll'
  if (process.platform === 'darwin') return 'dylib'
  return 'so'
}

function resolveLoadExtensionCandidates(extensionPath: string) {
  const normalized = extensionPath.trim()
  if (!normalized) {
    return []
  }

  const suffix = `.${resolveSqliteVecExtensionSuffix()}`
  const withoutSuffix = normalized.endsWith(suffix)
    ? normalized.slice(0, -suffix.length)
    : normalized

  return Array.from(new Set([withoutSuffix, normalized].filter(Boolean)))
}

function normalizePathCandidate(candidate: unknown) {
  if (typeof candidate !== 'string') {
    return null
  }

  const trimmed = candidate.trim()
  if (!trimmed) {
    return null
  }

  return trimmed
}

function appendPathCandidate(candidates: unknown[], candidate: unknown) {
  const normalized = normalizePathCandidate(candidate)
  if (normalized) {
    candidates.push(normalized)
  }
}

function resolveSqliteVecExtensionPathFromPackage() {
  const packageName = resolveSqliteVecPackageName()
  if (!packageName) {
    throw new Error(`当前平台不受 sqlite-vec 支持：${process.platform}-${process.arch}`)
  }

  const extensionFileName = `vec0.${resolveSqliteVecExtensionSuffix()}`
  const cwd = process.cwd()
  const candidates: unknown[] = []

  const envPath = (process.env.SQLITE_VEC_EXTENSION_PATH || '').trim()
  if (envPath) {
    const envResolved = path.isAbsolute(envPath) ? envPath : path.resolve(cwd, envPath)
    const suffix = `.${resolveSqliteVecExtensionSuffix()}`
    appendPathCandidate(candidates, envResolved)
    if (!envResolved.endsWith(suffix)) {
      appendPathCandidate(candidates, `${envResolved}${suffix}`)
    }
  }

  appendPathCandidate(candidates, path.join(cwd, 'node_modules', packageName, extensionFileName))

  const pnpmDir = path.join(cwd, 'node_modules', '.pnpm')
  if (existsSync(pnpmDir)) {
    try {
      const entries = readdirSync(pnpmDir)
      for (const entry of entries) {
        if (entry.startsWith(`${packageName}@`) || entry.startsWith('sqlite-vec@')) {
          appendPathCandidate(
            candidates,
            path.join(pnpmDir, entry, 'node_modules', packageName, extensionFileName)
          )
        }
      }
    } catch {
      // ignore
    }
  }

  if (typeof sqliteVec.getLoadablePath === 'function') {
    try {
      const loadablePath = sqliteVec.getLoadablePath()
      appendPathCandidate(candidates, loadablePath)
    } catch {
      // ignore
    }
  }

  const uniqueCandidates = Array.from(new Set(candidates))
    .map((item) => normalizePathCandidate(item))
    .filter((item): item is string => Boolean(item))

  for (const extensionPath of uniqueCandidates) {
    if (existsSync(extensionPath)) {
      return extensionPath
    }
  }

  throw new Error(
    `未找到 ${packageName} 的扩展文件（${extensionFileName}）。已检查路径：\n${uniqueCandidates
      .map((item) => `- ${item}`)
      .join('\n')}`
  )
}

function tryLoadSqliteExtensionByPath(db: VectorDatabase, extensionPath: string) {
  const loadCandidates = resolveLoadExtensionCandidates(extensionPath)
  const loadErrors: string[] = []

  for (const loadPath of loadCandidates) {
    try {
      db.loadExtension(loadPath)
      return null
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      loadErrors.push(`路径 ${loadPath} 加载失败: ${message}`)
    }
  }

  return loadErrors
}

function loadSqliteVecExtension(db: VectorDatabase) {
  const errors: string[] = []
  const packageName = resolveSqliteVecPackageName() || 'sqlite-vec-linux-x64'

  try {
    const extensionPath = resolveSqliteVecExtensionPathFromPackage()
    const loadErrors = tryLoadSqliteExtensionByPath(db, extensionPath)
    if (!loadErrors) {
      return
    }
    errors.push(
      ['按平台包路径加载失败（已定位到扩展文件）。', ...loadErrors.map((item) => `- ${item}`)].join(
        '\n'
      )
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errors.push(`按平台包路径加载失败: ${message}`)
  }

  if (typeof sqliteVec.getLoadablePath === 'function') {
    try {
      const loadablePath = sqliteVec.getLoadablePath()
      const normalized = normalizePathCandidate(loadablePath)
      if (normalized) {
        const loadErrors = tryLoadSqliteExtensionByPath(db, normalized)
        if (!loadErrors) {
          return
        }
        errors.push(
          ['按 sqlite-vec getLoadablePath 加载失败。', ...loadErrors.map((item) => `- ${item}`)].join(
            '\n'
          )
        )
      } else {
        errors.push(`按 sqlite-vec getLoadablePath 加载失败: 返回了无效路径类型（${typeof loadablePath}）`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`按 sqlite-vec getLoadablePath 加载失败: ${message}`)
    }
  }

  throw new Error(
    [
      'sqlite-vec 扩展加载失败。',
      `平台: ${process.platform}-${process.arch}`,
      ...errors.map((item) => `- ${item}`),
      `建议执行：pnpm add sqlite-vec ${packageName}`,
    ].join('\n')
  )
}

function nowIso() {
  return new Date().toISOString()
}

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex')
}

function estimateTokenCount(text: string) {
  const normalized = text.trim()
  if (!normalized) return 0

  const byWhitespace = normalized.split(/\s+/).filter(Boolean).length
  const byChars = Math.ceil(normalized.length / 4)

  return Math.max(byWhitespace, byChars)
}

function splitLongParagraph(paragraph: string) {
  if (paragraph.length <= MAX_CHUNK_CHARS) {
    return [paragraph]
  }

  const chunks: string[] = []
  let start = 0

  while (start < paragraph.length) {
    const end = Math.min(paragraph.length, start + MAX_CHUNK_CHARS)
    const piece = paragraph.slice(start, end).trim()
    if (piece) {
      chunks.push(piece)
    }

    if (end >= paragraph.length) {
      break
    }

    const nextStart = Math.max(end - CHUNK_OVERLAP_CHARS, start + 1)
    start = nextStart
  }

  return chunks
}

function splitPostContent(content: string) {
  const normalized = content.replace(/\r\n?/g, '\n').trim()
  if (!normalized) {
    return []
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)

  const normalizedParagraphs = paragraphs.flatMap((paragraph) => splitLongParagraph(paragraph))
  const chunks: string[] = []

  let current = ''
  for (const paragraph of normalizedParagraphs) {
    if (!current) {
      current = paragraph
      continue
    }

    const next = `${current}\n\n${paragraph}`
    if (next.length <= MAX_CHUNK_CHARS) {
      current = next
      continue
    }

    chunks.push(current)
    current = paragraph
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}

function shouldIndexPost(post: Pick<IndexablePost, 'status'>) {
  return post.status === PostStatus.PUBLISHED
}

function buildPostChecksum(post: Pick<IndexablePost, 'title' | 'excerpt' | 'content'>) {
  const joined = [post.title.trim(), (post.excerpt || '').trim(), post.content.trim()].join('\n\n')
  return sha256(joined)
}

function buildEmbeddingInput(post: Pick<IndexablePost, 'title' | 'excerpt'>, chunk: string) {
  return [
    `标题：${post.title}`,
    post.excerpt ? `摘要：${post.excerpt}` : '',
    `正文片段：${chunk}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function buildPostChunks(post: Pick<IndexablePost, 'title' | 'excerpt' | 'content'>): BuiltChunk[] {
  const rawChunks = splitPostContent(post.content)

  return rawChunks.map((content, index) => ({
    chunkIndex: index,
    content,
    embeddingInput: buildEmbeddingInput(post, content),
  }))
}

async function loadDatabaseSyncCtor() {
  const moduleName = 'node:sqlite'
  const sqliteModule = (await import(moduleName)) as {
    DatabaseSync?: DatabaseSyncCtor
  }

  if (!sqliteModule.DatabaseSync) {
    throw new Error('当前 Node 运行时不支持 node:sqlite')
  }

  return sqliteModule.DatabaseSync
}

function beginTransaction(db: VectorDatabase) {
  db.exec('BEGIN IMMEDIATE')
}

function commitTransaction(db: VectorDatabase) {
  db.exec('COMMIT')
}

function rollbackTransaction(db: VectorDatabase) {
  db.exec('ROLLBACK')
}

function ensureBaseTables(db: VectorDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_documents (
      post_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      indexed_at TEXT,
      updated_at TEXT NOT NULL,
      error TEXT,
      content_checksum TEXT,
      chunk_count INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_chunks (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (post_id) REFERENCES ai_documents(post_id) ON DELETE CASCADE
    )
  `)

  db.exec('CREATE INDEX IF NOT EXISTS idx_ai_chunks_post_id ON ai_chunks(post_id)')
}

function readCurrentDimension(db: VectorDatabase) {
  const row = db
    .prepare('SELECT value FROM ai_meta WHERE key = ?')
    .get(VECTOR_META_KEY)

  if (!row) {
    return null
  }

  const parsed = Number.parseInt(toStringOrEmpty(row.value), 10)
  return isPositiveInteger(parsed) ? parsed : null
}

function saveCurrentDimension(db: VectorDatabase, dimension: number) {
  db
    .prepare(
      `
      INSERT INTO ai_meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
      `
    )
    .run(VECTOR_META_KEY, String(dimension), nowIso())
}

function createVectorTable(db: VectorDatabase, dimension: number) {
  const safeDimension = sanitizeDimension(dimension, AI_DEFAULTS.embeddingDimensions)
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS ai_chunk_vectors USING vec0(chunk_id TEXT PRIMARY KEY, embedding float[${safeDimension}]);`
  )
}

function resetVectorIndex(db: VectorDatabase, dimension: number) {
  beginTransaction(db)
  try {
    db.exec('DROP TABLE IF EXISTS ai_chunk_vectors')
    db.exec('DELETE FROM ai_chunks')
    db.exec('DELETE FROM ai_documents')
    saveCurrentDimension(db, dimension)
    createVectorTable(db, dimension)
    commitTransaction(db)
  } catch (error) {
    rollbackTransaction(db)
    throw error
  }
}

function ensureVectorSchema(db: VectorDatabase, options: OpenVectorDatabaseOptions): number {
  ensureBaseTables(db)

  const currentDimension = readCurrentDimension(db)
  const expectedDimension = options.dimensions
    ? sanitizeDimension(options.dimensions, AI_DEFAULTS.embeddingDimensions)
    : null

  if (expectedDimension !== null) {
    if (currentDimension === null) {
      saveCurrentDimension(db, expectedDimension)
      createVectorTable(db, expectedDimension)
      return expectedDimension
    }

    if (currentDimension !== expectedDimension) {
      if (!options.resetOnDimensionMismatch) {
        throw new Error(
          `向量维度不一致：当前索引维度 ${currentDimension}，请求维度 ${expectedDimension}，请先重建索引。`
        )
      }

      resetVectorIndex(db, expectedDimension)
      return expectedDimension
    }

    createVectorTable(db, expectedDimension)
    return expectedDimension
  }

  if (currentDimension === null) {
    const fallbackDimension = AI_DEFAULTS.embeddingDimensions
    saveCurrentDimension(db, fallbackDimension)
    createVectorTable(db, fallbackDimension)
    return fallbackDimension
  }

  createVectorTable(db, currentDimension)
  return currentDimension
}

async function openVectorDatabase(options: OpenVectorDatabaseOptions = {}): Promise<OpenVectorDatabaseResult> {
  const DatabaseSync = await loadDatabaseSyncCtor()
  const dbPath = resolveSqliteDatabasePath()
  const dbDir = path.dirname(dbPath)

  mkdirSync(dbDir, { recursive: true })

  const db = new DatabaseSync(dbPath, { allowExtension: true })
  try {
    loadSqliteVecExtension(db)

    // 单机场景启用 WAL，避免后台写索引时阻塞前台读请求。
    try {
      db.exec('PRAGMA journal_mode = WAL')
    } catch {
      // noop
    }

    try {
      db.exec('PRAGMA synchronous = NORMAL')
    } catch {
      // noop
    }

    db.exec('PRAGMA foreign_keys = ON')
    db.exec('PRAGMA busy_timeout = 5000')

    const dimension = ensureVectorSchema(db, options)

    return {
      db,
      dimension,
    }
  } catch (error) {
    closeQuietly(db)
    throw error
  }
}

function closeQuietly(db: VectorDatabase) {
  try {
    db.close()
  } catch {
    // noop
  }
}

function sanitizeScore(distance: number) {
  const safeDistance = Number.isFinite(distance) ? Math.max(distance, 0) : 0
  return 1 / (1 + safeDistance)
}

function normalizeEmbeddingVector(value: unknown) {
  if (!Array.isArray(value)) {
    return null
  }

  const vector = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
  if (vector.length === 0) {
    return null
  }

  return vector
}

function normalizeEmbeddingMatrix(value: unknown, context: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${context} 返回结果不是数组，无法继续检索`)
  }

  const matrix = value
    .map((item) => normalizeEmbeddingVector(item))
    .filter((item): item is number[] => Boolean(item))

  if (matrix.length === 0) {
    throw new Error(`${context} 未返回有效向量，请确认 embedding 模型与接口兼容性`)
  }

  return matrix
}

function assertAiReady(settings: AiRuntimeSettings) {
  if (!settings.enabled) {
    throw new Error('AI 功能未启用')
  }

  if (!settings.hasApiKey) {
    throw new Error('AI API Key 未配置')
  }
}

function isIndexDimensionMismatchError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  return message.includes('Embedding 维度与当前索引维度不一致')
}

async function indexPostRecord(
  post: IndexablePost,
  context: {
    settings: AiRuntimeSettings
    dbContext?: OpenVectorDatabaseResult
  }
): Promise<AiPostIndexResult> {
  if (!shouldIndexPost(post)) {
    await deletePostVectorIndex(post.id)
    return {
      postId: post.id,
      status: 'deleted',
      chunkCount: 0,
      reason: '文章不是已发布状态，已移除索引',
    }
  }

  const checksum = buildPostChecksum(post)
  const chunks = buildPostChunks(post)
  const embeddingInputs = chunks.map((item) => item.embeddingInput)

  const vectors =
    embeddingInputs.length > 0
      ? normalizeEmbeddingMatrix(
          await runOpenAiCompatibleEmbeddings({
            texts: embeddingInputs,
            settings: context.settings,
          }),
          '索引 embedding'
        )
      : []

  if (vectors.length !== embeddingInputs.length) {
    throw new Error(
      `索引 embedding 数量不匹配：期望 ${embeddingInputs.length}，实际 ${vectors.length}`
    )
  }

  const vectorDimension = sanitizeDimension(
    vectors[0]?.length ?? context.settings.embeddingDimensions,
    context.settings.embeddingDimensions
  )

  if (vectors.some((vector) => vector.length !== vectorDimension)) {
    throw new Error('Embedding 返回向量维度不一致，无法写入索引')
  }

  let dbContext = context.dbContext
  if (!dbContext) {
    dbContext = await openVectorDatabase({
      dimensions: vectorDimension,
      resetOnDimensionMismatch: true,
    })
  } else if (dbContext.dimension !== vectorDimension) {
    throw new Error(
      `Embedding 维度与当前索引维度不一致：索引维度 ${dbContext.dimension}，本次向量维度 ${vectorDimension}`
    )
  }

  const { db } = dbContext

  try {
    const existingDoc = db
      .prepare(
        'SELECT status, content_checksum AS contentChecksum, chunk_count AS chunkCount FROM ai_documents WHERE post_id = ?'
      )
      .get(post.id)

    const existingChecksum = toStringOrEmpty(existingDoc?.contentChecksum)
    const existingStatus = toStringOrEmpty(existingDoc?.status)
    const existingChunkCount = toNumberOrZero(existingDoc?.chunkCount)

    if (existingStatus === 'indexed' && existingChecksum === checksum) {
      return {
        postId: post.id,
        status: 'unchanged',
        chunkCount: existingChunkCount,
      }
    }

    const timestamp = nowIso()

    beginTransaction(db)
    try {
      db
        .prepare('DELETE FROM ai_chunk_vectors WHERE chunk_id IN (SELECT id FROM ai_chunks WHERE post_id = ?)')
        .run(post.id)
      db.prepare('DELETE FROM ai_chunks WHERE post_id = ?').run(post.id)

      const insertChunkStmt = db.prepare(
        `
        INSERT INTO ai_chunks (id, post_id, chunk_index, content, token_count, checksum, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )

      const insertVectorStmt = db.prepare(
        'INSERT INTO ai_chunk_vectors (chunk_id, embedding) VALUES (?, ?)'
      )

      for (const [index, chunk] of chunks.entries()) {
        const chunkId = `${post.id}:${chunk.chunkIndex}`
        insertChunkStmt.run(
          chunkId,
          post.id,
          chunk.chunkIndex,
          chunk.content,
          estimateTokenCount(chunk.content),
          sha256(chunk.content),
          timestamp
        )

        const vector = vectors[index]
        if (vector) {
          insertVectorStmt.run(chunkId, JSON.stringify(vector))
        }
      }

      db
        .prepare(
          `
          INSERT INTO ai_documents (post_id, status, indexed_at, updated_at, error, content_checksum, chunk_count)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(post_id) DO UPDATE SET
            status = excluded.status,
            indexed_at = excluded.indexed_at,
            updated_at = excluded.updated_at,
            error = excluded.error,
            content_checksum = excluded.content_checksum,
            chunk_count = excluded.chunk_count
          `
        )
        .run(post.id, 'indexed', timestamp, timestamp, null, checksum, chunks.length)

      commitTransaction(db)
    } catch (error) {
      rollbackTransaction(db)

      db
        .prepare(
          `
          INSERT INTO ai_documents (post_id, status, indexed_at, updated_at, error, content_checksum, chunk_count)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(post_id) DO UPDATE SET
            status = excluded.status,
            indexed_at = excluded.indexed_at,
            updated_at = excluded.updated_at,
            error = excluded.error,
            content_checksum = excluded.content_checksum,
            chunk_count = excluded.chunk_count
          `
        )
        .run(
          post.id,
          'failed',
          null,
          timestamp,
          error instanceof Error ? error.message : '索引写入失败',
          checksum,
          0
        )

      throw error
    }

    return {
      postId: post.id,
      status: 'indexed',
      chunkCount: chunks.length,
    }
  } finally {
    if (!context.dbContext) {
      closeQuietly(db)
    }
  }
}

export async function indexPostById(postId: string): Promise<AiPostIndexResult> {
  const normalizedPostId = postId.trim()
  if (!normalizedPostId) {
    throw new Error('postId 不能为空')
  }

  const settings = await getAiRuntimeSettings()
  assertAiReady(settings)

  const post = await prisma.post.findUnique({
    where: { id: normalizedPostId },
    select: {
      id: true,
      title: true,
      excerpt: true,
      content: true,
      status: true,
    },
  })

  if (!post) {
    await deletePostVectorIndex(normalizedPostId)
    return {
      postId: normalizedPostId,
      status: 'deleted',
      chunkCount: 0,
      reason: '文章不存在，已删除索引',
    }
  }

  return indexPostRecord(post, { settings })
}

export async function deletePostVectorIndex(postId: string) {
  const normalizedPostId = postId.trim()
  if (!normalizedPostId) {
    return { postId: normalizedPostId, deleted: false }
  }

  const { db } = await openVectorDatabase()

  try {
    beginTransaction(db)
    try {
      db
        .prepare('DELETE FROM ai_chunk_vectors WHERE chunk_id IN (SELECT id FROM ai_chunks WHERE post_id = ?)')
        .run(normalizedPostId)
      db.prepare('DELETE FROM ai_chunks WHERE post_id = ?').run(normalizedPostId)
      db.prepare('DELETE FROM ai_documents WHERE post_id = ?').run(normalizedPostId)
      commitTransaction(db)
    } catch (error) {
      rollbackTransaction(db)
      throw error
    }

    return {
      postId: normalizedPostId,
      deleted: true,
    }
  } finally {
    closeQuietly(db)
  }
}

async function deletePostVectorIndexes(postIds: string[]) {
  const normalizedPostIds = Array.from(new Set(postIds.map((item) => item.trim()).filter(Boolean)))
  if (!normalizedPostIds.length) {
    return 0
  }

  const { db } = await openVectorDatabase()

  try {
    beginTransaction(db)
    try {
      const deleteVectorsStmt = db.prepare(
        'DELETE FROM ai_chunk_vectors WHERE chunk_id IN (SELECT id FROM ai_chunks WHERE post_id = ?)'
      )
      const deleteChunksStmt = db.prepare('DELETE FROM ai_chunks WHERE post_id = ?')
      const deleteDocStmt = db.prepare('DELETE FROM ai_documents WHERE post_id = ?')

      for (const postId of normalizedPostIds) {
        deleteVectorsStmt.run(postId)
        deleteChunksStmt.run(postId)
        deleteDocStmt.run(postId)
      }

      commitTransaction(db)
    } catch (error) {
      rollbackTransaction(db)
      throw error
    }

    return normalizedPostIds.length
  } finally {
    closeQuietly(db)
  }
}

export async function rebuildAllPostIndex(): Promise<AiRebuildIndexResult> {
  const settings = await getAiRuntimeSettings()
  assertAiReady(settings)

  const publishedRows = await prisma.post.findMany({
    where: {
      status: PostStatus.PUBLISHED,
    },
    select: {
      id: true,
    },
    orderBy: {
      id: 'asc',
    },
  })
  const publishedPostIds = publishedRows.map((row) => row.id)

  const indexedPostIds = await listIndexedPostIds()
  const publishedIdSet = new Set(publishedPostIds)

  const staleIndexedPostIds = indexedPostIds.filter((indexedPostId) => !publishedIdSet.has(indexedPostId))
  let deleted = await deletePostVectorIndexes(staleIndexedPostIds)

  let indexed = 0
  let unchanged = 0
  let failed = 0
  const errors: Array<{ postId: string; error: string }> = []

  const concurrency = resolveRebuildConcurrency()
  let cursor = 0

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      let dbContext = await openVectorDatabase({
        dimensions: settings.embeddingDimensions,
        resetOnDimensionMismatch: true,
      })

      try {
        while (cursor < publishedPostIds.length) {
          const index = cursor
          cursor += 1
          const postId = publishedPostIds[index]
          if (!postId) {
            continue
          }

          const post = await prisma.post.findUnique({
            where: { id: postId },
            select: {
              id: true,
              title: true,
              excerpt: true,
              content: true,
              status: true,
            },
          })
          if (!post) {
            const deleteResult = await deletePostVectorIndex(postId)
            if (deleteResult.deleted) {
              deleted += 1
            }
            continue
          }

          try {
            let result: AiPostIndexResult
            try {
              result = await indexPostRecord(post, {
                settings,
                dbContext,
              })
            } catch (error) {
              if (!isIndexDimensionMismatchError(error)) {
                throw error
              }

              result = await indexPostRecord(post, {
                settings,
              })
              const nextDbContext = await openVectorDatabase()
              closeQuietly(dbContext.db)
              dbContext = nextDbContext
            }

            if (result.status === 'indexed') {
              indexed += 1
            } else if (result.status === 'unchanged') {
              unchanged += 1
            } else if (result.status === 'deleted') {
              deleted += 1
            }
          } catch (error) {
            failed += 1
            errors.push({
              postId: post.id,
              error: error instanceof Error ? error.message : '重建索引失败',
            })
          }
        }
      } finally {
        closeQuietly(dbContext.db)
      }
    })
  )

  return {
    totalPublishedPosts: publishedPostIds.length,
    indexed,
    unchanged,
    deleted,
    failed,
    errors,
  }
}

export async function listIndexedPostIds() {
  const { db } = await openVectorDatabase()

  try {
    const rows = db
      .prepare('SELECT post_id AS postId FROM ai_documents')
      .all()

    return rows
      .map((row) => toStringOrEmpty(row.postId).trim())
      .filter(Boolean)
  } finally {
    closeQuietly(db)
  }
}

export async function searchAiChunksByEmbedding(
  embedding: number[],
  options: {
    topK: number
    requireReady?: boolean
  }
): Promise<AiVectorSearchHit[]> {
  const normalizedEmbedding = embedding.filter((value) => Number.isFinite(value))
  if (!normalizedEmbedding.length) {
    return []
  }

  const topK = clamp(Math.round(options.topK || 0), 1, 100)
  const { db } = await openVectorDatabase({
    dimensions: normalizedEmbedding.length,
    resetOnDimensionMismatch: false,
  })

  try {
    if (options.requireReady === true) {
      const indexedRow = db
        .prepare("SELECT COUNT(*) AS count FROM ai_documents WHERE status = 'indexed'")
        .get()
      const chunkRow = db
        .prepare('SELECT COUNT(*) AS count FROM ai_chunks')
        .get()

      if (toNumberOrZero(indexedRow?.count) <= 0 || toNumberOrZero(chunkRow?.count) <= 0) {
        throw new Error('请先执行向量化')
      }
    }

    const rows = db
      .prepare(
        `
        SELECT
          c.id AS chunkId,
          c.post_id AS postId,
          c.chunk_index AS chunkIndex,
          c.content AS content,
          v.distance AS distance
        FROM ai_chunk_vectors v
        JOIN ai_chunks c ON c.id = v.chunk_id
        WHERE v.embedding MATCH ? AND v.k = ?
        ORDER BY v.distance ASC
        `
      )
      .all(JSON.stringify(normalizedEmbedding), topK)

    return rows.map((row) => {
      const distance = toNumberOrZero(row.distance)
      return {
        chunkId: toStringOrEmpty(row.chunkId),
        postId: toStringOrEmpty(row.postId),
        chunkIndex: toNumberOrZero(row.chunkIndex),
        content: toStringOrEmpty(row.content),
        distance,
        score: sanitizeScore(distance),
      }
    })
  } finally {
    closeQuietly(db)
  }
}

export async function searchAiChunksByQuery(
  query: string,
  options: {
    topK: number
  }
): Promise<AiVectorSearchHit[]> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    return []
  }

  const settings = await getAiRuntimeSettings()
  assertAiReady(settings)

  let embedding: number[] | null = null

  try {
    const queryEmbeddingList = normalizeEmbeddingMatrix(
      await runOpenAiCompatibleEmbeddings({
        texts: [normalizedQuery],
        settings,
      }),
      '查询 embedding'
    )
    embedding = queryEmbeddingList[0] ?? null
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    throw new Error(
      `查询向量生成失败：${message}。请检查 embedding 模型是否为向量模型，以及 OpenAI 兼容服务是否正确返回 /embeddings。`
    )
  }

  if (!embedding) {
    throw new Error('查询向量为空，请检查 embedding 模型配置')
  }

  return searchAiChunksByEmbedding(embedding, {
    topK: options.topK,
    requireReady: true,
  })
}

export async function getAiVectorIndexStats(): Promise<AiVectorIndexStats> {
  const { db } = await openVectorDatabase()

  try {
    const totalRow = db
      .prepare('SELECT COUNT(*) AS count FROM ai_documents')
      .get()
    const indexedRow = db
      .prepare("SELECT COUNT(*) AS count FROM ai_documents WHERE status = 'indexed'")
      .get()
    const failedRow = db
      .prepare("SELECT COUNT(*) AS count FROM ai_documents WHERE status = 'failed'")
      .get()
    const queuedRow = db
      .prepare("SELECT COUNT(*) AS count FROM ai_documents WHERE status = 'queued'")
      .get()
    const chunkRow = db
      .prepare('SELECT COUNT(*) AS count FROM ai_chunks')
      .get()
    const indexedAtRow = db
      .prepare('SELECT MAX(indexed_at) AS maxIndexedAt FROM ai_documents')
      .get()

    return {
      documentTotal: toNumberOrZero(totalRow?.count),
      indexedDocuments: toNumberOrZero(indexedRow?.count),
      failedDocuments: toNumberOrZero(failedRow?.count),
      queuedDocuments: toNumberOrZero(queuedRow?.count),
      chunkTotal: toNumberOrZero(chunkRow?.count),
      lastIndexedAt: toStringOrEmpty(indexedAtRow?.maxIndexedAt) || null,
    }
  } finally {
    closeQuietly(db)
  }
}

export async function getAiVectorIndexReadiness(): Promise<AiVectorIndexReadiness> {
  const stats = await getAiVectorIndexStats()
  const ready = stats.indexedDocuments > 0 && stats.chunkTotal > 0

  return {
    ready,
    reason: ready ? null : '请先执行向量化',
  }
}

export async function markPostIndexQueued(postId: string) {
  const normalizedPostId = postId.trim()
  if (!normalizedPostId) {
    return
  }

  const { db } = await openVectorDatabase()

  try {
    const timestamp = nowIso()
    db
      .prepare(
        `
        INSERT INTO ai_documents (post_id, status, indexed_at, updated_at, error, content_checksum, chunk_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(post_id) DO UPDATE SET
          status = excluded.status,
          updated_at = excluded.updated_at,
          error = excluded.error
        `
      )
      .run(normalizedPostId, 'queued', null, timestamp, null, null, 0)
  } finally {
    closeQuietly(db)
  }
}
