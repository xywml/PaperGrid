import { ChatOpenAI } from '@langchain/openai'
import { getAiRuntimeSettings, type AiRuntimeSettings } from '@/lib/ai/config'
import { normalizeAndValidateAiBaseUrl } from '@/lib/ai/security'

type AiChatModelOverrides = {
  model?: string
  temperature?: number
}

const OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS = 262144

function toClientConfiguration(baseUrl: string) {
  if (!baseUrl.trim()) return undefined
  return { baseURL: normalizeAndValidateAiBaseUrl(baseUrl) }
}

export function extractMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
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
      .join('\n')
      .trim()
  }
  return ''
}

export async function createAiChatModel(input: {
  settings?: AiRuntimeSettings
  overrides?: AiChatModelOverrides
} = {}) {
  const settings = input.settings || (await getAiRuntimeSettings())
  if (!settings.enabled) {
    throw new Error('AI 功能未启用')
  }
  if (!settings.apiKey) {
    throw new Error('缺少 AI API Key')
  }

  const temperature = typeof input.overrides?.temperature === 'number' ? input.overrides.temperature : 0.2
  const maxOutputTokens = Math.min(
    Math.max(Math.round(settings.answerMaxTokens), 1),
    OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS
  )
  const modelName =
    typeof input.overrides?.model === 'string' && input.overrides.model.trim()
      ? input.overrides.model.trim()
      : settings.chatModel

  return new ChatOpenAI({
    apiKey: settings.apiKey,
    model: modelName,
    temperature,
    maxTokens: maxOutputTokens,
    streaming: true,
    streamUsage: false,
    ...(settings.baseUrl
      ? {
          configuration: toClientConfiguration(settings.baseUrl),
        }
      : {}),
  })
}

function normalizeEmbeddingVector(value: unknown) {
  if (!Array.isArray(value)) {
    return null
  }

  const vector = value
    .map((item) => {
      if (typeof item === 'number' && Number.isFinite(item)) return item
      if (typeof item === 'string') {
        const parsed = Number(item)
        if (Number.isFinite(parsed)) return parsed
      }
      return null
    })
    .filter((item): item is number => item !== null)

  if (!vector.length) {
    return null
  }

  return vector
}

function toRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function parseEmbeddingsFromArray(input: unknown[]) {
  const vectors: number[][] = []
  for (const item of input) {
    const vectorDirect = normalizeEmbeddingVector(item)
    if (vectorDirect) {
      vectors.push(vectorDirect)
      continue
    }

    const record = toRecord(item)
    if (!record) {
      continue
    }

    const candidate =
      normalizeEmbeddingVector(record.embedding) ||
      normalizeEmbeddingVector(record.vector) ||
      normalizeEmbeddingVector(record.values)

    if (candidate) {
      vectors.push(candidate)
    }
  }

  return vectors
}

function parseEmbeddingsPayload(payload: unknown) {
  if (Array.isArray(payload)) {
    return parseEmbeddingsFromArray(payload)
  }

  const record = toRecord(payload)
  if (!record) {
    return []
  }

  if (Array.isArray(record.data)) {
    const vectors = parseEmbeddingsFromArray(record.data)
    if (vectors.length) return vectors
  }

  if (Array.isArray(record.embeddings)) {
    const vectors = parseEmbeddingsFromArray(record.embeddings)
    if (vectors.length) return vectors
  }

  const resultRecord = toRecord(record.result)
  if (resultRecord && Array.isArray(resultRecord.data)) {
    const vectors = parseEmbeddingsFromArray(resultRecord.data)
    if (vectors.length) return vectors
  }

  return []
}

function extractProviderErrorMessage(payload: unknown) {
  const record = toRecord(payload)
  if (!record) {
    return ''
  }

  const errorValue = record.error
  if (typeof errorValue === 'string') {
    return errorValue
  }

  const errorRecord = toRecord(errorValue)
  if (errorRecord) {
    const message = errorRecord.message
    if (typeof message === 'string') {
      return message
    }
  }

  const message = record.message
  if (typeof message === 'string') {
    return message
  }

  return ''
}

function shouldRetryWithoutDimensions(message: string) {
  const normalized = message.toLowerCase()
  if (!normalized) return false
  return (
    normalized.includes('dimension') ||
    normalized.includes('dimensions') ||
    normalized.includes('unknown parameter') ||
    normalized.includes('unexpected field')
  )
}

function resolveEmbeddingTimeoutMs() {
  const raw = Number.parseInt(process.env.AI_EMBEDDING_TIMEOUT_MS || '', 10)
  if (!Number.isFinite(raw)) {
    return 20000
  }
  return Math.min(Math.max(raw, 1000), 120000)
}

async function requestEmbeddings(params: {
  settings: AiRuntimeSettings
  texts: string[]
  useDimensions: boolean
}) {
  const normalizedBaseUrl = normalizeAndValidateAiBaseUrl(params.settings.baseUrl)
  const endpoint = `${normalizedBaseUrl}/embeddings`
  const timeoutMs = resolveEmbeddingTimeoutMs()

  const body: Record<string, unknown> = {
    model: params.settings.embeddingModel,
    input: params.texts,
    encoding_format: 'float',
  }

  if (params.useDimensions && params.settings.embeddingDimensions > 0) {
    body.dimensions = params.settings.embeddingDimensions
  }

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  let response: Response
  try {
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.settings.apiKey}`,
        },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: controller.signal,
        redirect: 'error',
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Embedding 请求超时（>${timeoutMs}ms）`)
      }
      throw error
    }
  } finally {
    clearTimeout(timer)
  }

  const payload = (await response.json().catch(() => null)) as unknown
  const errorMessage = extractProviderErrorMessage(payload)

  if (!response.ok) {
    throw new Error(errorMessage || `Embedding 请求失败（HTTP ${response.status}）`)
  }

  const vectors = parseEmbeddingsPayload(payload)
  if (!vectors.length) {
    throw new Error(errorMessage || 'Embedding 接口未返回有效向量')
  }

  return vectors
}

export async function runOpenAiCompatibleEmbeddings(input: {
  texts: string[]
  settings?: AiRuntimeSettings
}) {
  const texts = input.texts.map((item) => item.trim()).filter(Boolean)
  if (!texts.length) {
    return []
  }

  const settings = input.settings || (await getAiRuntimeSettings())
  if (!settings.enabled) {
    throw new Error('AI 功能未启用')
  }
  if (!settings.apiKey) {
    throw new Error('缺少 AI API Key')
  }

  try {
    return await requestEmbeddings({
      settings,
      texts,
      useDimensions: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!shouldRetryWithoutDimensions(message)) {
      throw error
    }

    return requestEmbeddings({
      settings,
      texts,
      useDimensions: false,
    })
  }
}
