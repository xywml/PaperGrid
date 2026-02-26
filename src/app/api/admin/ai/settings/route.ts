import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import {
  AI_DEFAULTS,
  AI_SETTING_DEFINITIONS,
  AI_SETTING_KEYS,
  getAiRuntimeSettings,
  wrapSettingValue,
} from '@/lib/ai/config'
import { AiBaseUrlValidationError, normalizeAndValidateAiBaseUrl } from '@/lib/ai/security'

const GET_LIMIT = {
  windowMs: 60 * 1000,
  max: 300,
}

const PATCH_LIMIT = {
  windowMs: 60 * 1000,
  max: 15,
}

function toNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizePatchBody(body: Record<string, unknown>) {
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : AI_DEFAULTS.enabled
  const provider = 'openai-compatible'
  const baseUrlRaw = typeof body.baseUrl === 'string' ? body.baseUrl : AI_DEFAULTS.baseUrl
  const baseUrl = normalizeAndValidateAiBaseUrl(baseUrlRaw, { allowEmpty: true })
  const chatModel =
    typeof body.chatModel === 'string' && body.chatModel.trim()
      ? body.chatModel.trim()
      : AI_DEFAULTS.chatModel
  const embeddingModel =
    typeof body.embeddingModel === 'string' && body.embeddingModel.trim()
      ? body.embeddingModel.trim()
      : AI_DEFAULTS.embeddingModel
  const embeddingDimensions = clamp(
    Math.round(toNumber(body.embeddingDimensions, AI_DEFAULTS.embeddingDimensions)),
    1,
    8192
  )
  const ragTopK = clamp(Math.round(toNumber(body.ragTopK, AI_DEFAULTS.ragTopK)), 1, 50)
  const ragMinScore = clamp(toNumber(body.ragMinScore, AI_DEFAULTS.ragMinScore), 0, 1)
  const answerMaxTokens = clamp(
    Math.round(toNumber(body.answerMaxTokens, AI_DEFAULTS.answerMaxTokens)),
    1,
    262144
  )

  return {
    enabled,
    provider,
    baseUrl,
    chatModel,
    embeddingModel,
    embeddingDimensions,
    ragTopK,
    ragMinScore,
    answerMaxTokens,
  }
}

// GET /api/admin/ai/settings
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const limitResult = rateLimit(`admin-ai-settings-get:${session.user.id}`, GET_LIMIT)
    if (!limitResult.ok) {
      return NextResponse.json(
        { error: '请求过于频繁' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const settings = await getAiRuntimeSettings()

    return NextResponse.json({
      enabled: settings.enabled,
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      chatModel: settings.chatModel,
      embeddingModel: settings.embeddingModel,
      embeddingDimensions: settings.embeddingDimensions,
      ragTopK: settings.ragTopK,
      ragMinScore: settings.ragMinScore,
      answerMaxTokens: settings.answerMaxTokens,
      hasApiKey: settings.hasApiKey,
    }, {
      headers: rateLimitHeaders(limitResult),
    })
  } catch (error) {
    console.error('获取 AI 设置失败:', error)
    return NextResponse.json({ error: '获取 AI 设置失败' }, { status: 500 })
  }
}

// PATCH /api/admin/ai/settings
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const limitResult = rateLimit(
      `admin-ai-settings-patch:${session.user.id}:${getClientIp(request)}`,
      PATCH_LIMIT
    )
    if (!limitResult.ok) {
      return NextResponse.json(
        { error: '操作过于频繁，请稍后重试' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const normalized = normalizePatchBody(body)

    const editableDefinitions = AI_SETTING_DEFINITIONS.filter(
      (item) => item.editable && !item.secret
    )

    const valueMap: Record<string, boolean | number | string> = {
      [AI_SETTING_KEYS.enabled]: normalized.enabled,
      [AI_SETTING_KEYS.provider]: normalized.provider,
      [AI_SETTING_KEYS.baseUrl]: normalized.baseUrl,
      [AI_SETTING_KEYS.chatModel]: normalized.chatModel,
      [AI_SETTING_KEYS.embeddingModel]: normalized.embeddingModel,
      [AI_SETTING_KEYS.embeddingDimensions]: normalized.embeddingDimensions,
      [AI_SETTING_KEYS.ragTopK]: normalized.ragTopK,
      [AI_SETTING_KEYS.ragMinScore]: normalized.ragMinScore,
      [AI_SETTING_KEYS.answerMaxTokens]: normalized.answerMaxTokens,
    }

    await prisma.$transaction(
      editableDefinitions.map((item) =>
        prisma.setting.upsert({
          where: { key: item.key },
          create: {
            key: item.key,
            value: wrapSettingValue(valueMap[item.key] ?? item.defaultValue),
            group: item.group,
            editable: item.editable,
            secret: item.secret,
            description: item.description,
          },
          update: {
            value: wrapSettingValue(valueMap[item.key] ?? item.defaultValue),
            group: item.group,
            editable: item.editable,
            secret: item.secret,
            description: item.description,
          },
        })
      )
    )

    return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(limitResult) })
  } catch (error) {
    if (error instanceof AiBaseUrlValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('更新 AI 设置失败:', error)
    return NextResponse.json({ error: '更新 AI 设置失败' }, { status: 500 })
  }
}
