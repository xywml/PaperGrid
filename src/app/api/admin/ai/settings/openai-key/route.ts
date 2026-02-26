import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AI_SETTING_DEFINITIONS, AI_SETTING_KEYS, wrapSettingValue } from '@/lib/ai/config'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'

const KEY_DEFINITION = AI_SETTING_DEFINITIONS.find((item) => item.key === AI_SETTING_KEYS.apiKey)
const LIMIT = {
  windowMs: 60 * 1000,
  max: 10,
}

// POST /api/admin/ai/settings/openai-key
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const limitResult = rateLimit(
      `admin-ai-settings-openai-key:${session.user.id}:${getClientIp(request)}`,
      LIMIT
    )
    if (!limitResult.ok) {
      return NextResponse.json(
        { error: '操作过于频繁，请稍后重试' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
    if (!apiKey) {
      return NextResponse.json(
        { error: '缺少 apiKey' },
        { status: 400, headers: rateLimitHeaders(limitResult) }
      )
    }

    if (!KEY_DEFINITION) {
      return NextResponse.json({ error: 'AI 密钥配置定义缺失' }, { status: 500 })
    }

    await prisma.setting.upsert({
      where: { key: AI_SETTING_KEYS.apiKey },
      create: {
        key: AI_SETTING_KEYS.apiKey,
        value: wrapSettingValue(apiKey),
        group: KEY_DEFINITION.group,
        editable: KEY_DEFINITION.editable,
        secret: KEY_DEFINITION.secret,
        description: KEY_DEFINITION.description,
      },
      update: {
        value: wrapSettingValue(apiKey),
        group: KEY_DEFINITION.group,
        editable: KEY_DEFINITION.editable,
        secret: KEY_DEFINITION.secret,
        description: KEY_DEFINITION.description,
      },
    })

    return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(limitResult) })
  } catch (error) {
    console.error('保存 AI API Key 失败:', error)
    return NextResponse.json({ error: '保存失败' }, { status: 500 })
  }
}
