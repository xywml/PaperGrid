import { normalizeAndValidateAiBaseUrl } from '@/lib/ai/security'

export type AiProviderModel = {
  id: string
  object: string
  ownedBy: string | null
}

export type AiProviderModelListResult = {
  baseUrl: string
  models: AiProviderModel[]
  chatModels: string[]
  embeddingModels: string[]
}

function isEmbeddingModelName(modelId: string) {
  const normalized = modelId.toLowerCase()
  return /(embedding|embed|bge|e5|gte|text-embedding)/.test(normalized)
}

function toStringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function toModelListPayload(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const data = (payload as { data?: unknown }).data
  if (Array.isArray(data)) {
    return data.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
  }

  const models = (payload as { models?: unknown }).models
  if (Array.isArray(models)) {
    return models.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
  }

  return []
}

export async function fetchOpenAiCompatibleModels(input: {
  baseUrl: string
  apiKey: string
  timeoutMs?: number
}): Promise<AiProviderModelListResult> {
  const normalizedBaseUrl = normalizeAndValidateAiBaseUrl(input.baseUrl)
  const endpoint = `${normalizedBaseUrl}/models`
  const timeoutMs = input.timeoutMs && input.timeoutMs > 0 ? input.timeoutMs : 10000

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  let response: Response
  try {
    try {
      response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
        },
        signal: controller.signal,
        cache: 'no-store',
        redirect: 'error',
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`请求 /models 超时（>${timeoutMs}ms）`)
      }
      throw error
    }
  } finally {
    clearTimeout(timer)
  }

  const payload = (await response.json().catch(() => null)) as unknown

  if (!response.ok) {
    const errorMessage =
      toStringValue((payload as { error?: { message?: unknown } })?.error?.message) ||
      `请求 /models 失败（HTTP ${response.status}）`
    throw new Error(errorMessage)
  }

  const models = toModelListPayload(payload)
    .map((item) => {
      const id = toStringValue(item.id).trim()
      if (!id) {
        return null
      }
      return {
        id,
        object: toStringValue(item.object) || 'model',
        ownedBy: toStringValue(item.owned_by || item.ownedBy) || null,
      }
    })
    .filter((item): item is AiProviderModel => Boolean(item))
    .sort((left, right) => left.id.localeCompare(right.id))

  const embeddingModels = models
    .map((item) => item.id)
    .filter((id) => isEmbeddingModelName(id))

  const chatModels = models
    .map((item) => item.id)
    .filter((id) => !isEmbeddingModelName(id))

  return {
    baseUrl: normalizedBaseUrl,
    models,
    chatModels,
    embeddingModels,
  }
}
