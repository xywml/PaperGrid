import { getSetting } from '@/lib/settings'

export const AI_SETTING_KEYS = {
  enabled: 'ai.enabled',
  provider: 'ai.provider',
  baseUrl: 'ai.openai.baseUrl',
  apiKey: 'ai.openai.apiKey',
  chatModel: 'ai.chat.model',
  embeddingModel: 'ai.embedding.model',
  embeddingDimensions: 'ai.embedding.dimensions',
  ragTopK: 'ai.rag.topK',
  ragMinScore: 'ai.rag.minScore',
  answerMaxTokens: 'ai.answer.maxTokens',
} as const

export type AiRuntimeSettings = {
  enabled: boolean
  provider: 'openai-compatible'
  baseUrl: string
  apiKey: string
  hasApiKey: boolean
  chatModel: string
  embeddingModel: string
  embeddingDimensions: number
  ragTopK: number
  ragMinScore: number
  answerMaxTokens: number
}

export const AI_DEFAULTS: Omit<AiRuntimeSettings, 'apiKey' | 'hasApiKey'> = {
  enabled: false,
  provider: 'openai-compatible',
  baseUrl: '',
  chatModel: 'gpt-4o-mini',
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,
  ragTopK: 8,
  ragMinScore: 0.2,
  answerMaxTokens: 131072,
}

export type AiSettingDefinition = {
  key: string
  defaultValue: boolean | number | string
  group: 'ai'
  editable: boolean
  secret: boolean
  description: string
}

export const AI_SETTING_DEFINITIONS: AiSettingDefinition[] = [
  {
    key: AI_SETTING_KEYS.enabled,
    defaultValue: AI_DEFAULTS.enabled,
    group: 'ai',
    editable: true,
    secret: false,
    description: 'AI 功能总开关',
  },
  {
    key: AI_SETTING_KEYS.provider,
    defaultValue: AI_DEFAULTS.provider,
    group: 'ai',
    editable: true,
    secret: false,
    description: 'AI 提供商类型（固定 openai-compatible）',
  },
  {
    key: AI_SETTING_KEYS.baseUrl,
    defaultValue: AI_DEFAULTS.baseUrl,
    group: 'ai',
    editable: true,
    secret: false,
    description: 'OpenAI 兼容接口 Base URL',
  },
  {
    key: AI_SETTING_KEYS.apiKey,
    defaultValue: '',
    group: 'ai',
    editable: false,
    secret: true,
    description: 'OpenAI 兼容接口 API Key（敏感项）',
  },
  {
    key: AI_SETTING_KEYS.chatModel,
    defaultValue: AI_DEFAULTS.chatModel,
    group: 'ai',
    editable: true,
    secret: false,
    description: '对话模型名称',
  },
  {
    key: AI_SETTING_KEYS.embeddingModel,
    defaultValue: AI_DEFAULTS.embeddingModel,
    group: 'ai',
    editable: true,
    secret: false,
    description: 'Embedding 模型名称',
  },
  {
    key: AI_SETTING_KEYS.embeddingDimensions,
    defaultValue: AI_DEFAULTS.embeddingDimensions,
    group: 'ai',
    editable: true,
    secret: false,
    description: 'Embedding 向量维度',
  },
  {
    key: AI_SETTING_KEYS.ragTopK,
    defaultValue: AI_DEFAULTS.ragTopK,
    group: 'ai',
    editable: true,
    secret: false,
    description: 'RAG 检索召回数量',
  },
  {
    key: AI_SETTING_KEYS.ragMinScore,
    defaultValue: AI_DEFAULTS.ragMinScore,
    group: 'ai',
    editable: true,
    secret: false,
    description: 'RAG 最低相似度阈值',
  },
  {
    key: AI_SETTING_KEYS.answerMaxTokens,
    defaultValue: AI_DEFAULTS.answerMaxTokens,
    group: 'ai',
    editable: true,
    secret: false,
    description: '问答最大输出 Token',
  },
]

function ensureNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function ensureBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return fallback
}

function ensureString(value: unknown, fallback: string) {
  if (typeof value === 'string') return value
  return fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function resolveApiKeyEnv() {
  return (
    process.env.AI_OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_APIKEY ||
    ''
  ).trim()
}

export async function getAiRuntimeSettings(): Promise<AiRuntimeSettings> {
  const [
    enabledRaw,
    baseUrlRaw,
    dbApiKeyRaw,
    chatModelRaw,
    embeddingModelRaw,
    embeddingDimensionsRaw,
    ragTopKRaw,
    ragMinScoreRaw,
    answerMaxTokensRaw,
  ] = await Promise.all([
    getSetting<boolean>(AI_SETTING_KEYS.enabled, AI_DEFAULTS.enabled),
    getSetting<string>(AI_SETTING_KEYS.baseUrl, AI_DEFAULTS.baseUrl),
    getSetting<string>(AI_SETTING_KEYS.apiKey, ''),
    getSetting<string>(AI_SETTING_KEYS.chatModel, AI_DEFAULTS.chatModel),
    getSetting<string>(AI_SETTING_KEYS.embeddingModel, AI_DEFAULTS.embeddingModel),
    getSetting<number>(AI_SETTING_KEYS.embeddingDimensions, AI_DEFAULTS.embeddingDimensions),
    getSetting<number>(AI_SETTING_KEYS.ragTopK, AI_DEFAULTS.ragTopK),
    getSetting<number>(AI_SETTING_KEYS.ragMinScore, AI_DEFAULTS.ragMinScore),
    getSetting<number>(AI_SETTING_KEYS.answerMaxTokens, AI_DEFAULTS.answerMaxTokens),
  ])

  const envApiKey = resolveApiKeyEnv()
  const dbApiKey = ensureString(dbApiKeyRaw, '')
  const apiKey = envApiKey || dbApiKey

  return {
    enabled: ensureBoolean(enabledRaw, AI_DEFAULTS.enabled),
    provider: 'openai-compatible',
    baseUrl: ensureString(baseUrlRaw, AI_DEFAULTS.baseUrl).trim(),
    apiKey,
    hasApiKey: Boolean(apiKey),
    chatModel: ensureString(chatModelRaw, AI_DEFAULTS.chatModel).trim() || AI_DEFAULTS.chatModel,
    embeddingModel:
      ensureString(embeddingModelRaw, AI_DEFAULTS.embeddingModel).trim() ||
      AI_DEFAULTS.embeddingModel,
    embeddingDimensions: clamp(
      Math.round(ensureNumber(embeddingDimensionsRaw, AI_DEFAULTS.embeddingDimensions)),
      1,
      8192
    ),
    ragTopK: clamp(Math.round(ensureNumber(ragTopKRaw, AI_DEFAULTS.ragTopK)), 1, 50),
    ragMinScore: clamp(ensureNumber(ragMinScoreRaw, AI_DEFAULTS.ragMinScore), 0, 1),
    answerMaxTokens: clamp(
      Math.round(ensureNumber(answerMaxTokensRaw, AI_DEFAULTS.answerMaxTokens)),
      1,
      262144
    ),
  }
}

export function wrapSettingValue(value: boolean | number | string) {
  return { value }
}
