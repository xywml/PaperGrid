import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAiRuntimeSettings } from '@/lib/ai/config'
import { fetchOpenAiCompatibleModels } from '@/lib/ai/model-list'
import { AiBaseUrlValidationError } from '@/lib/ai/security'
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LIMIT = {
  windowMs: 60 * 1000,
  max: 120,
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const limitResult = rateLimit(`admin-ai-models:${session.user.id}:${getClientIp(request)}`, LIMIT)
    if (!limitResult.ok) {
      return NextResponse.json(
        { error: '请求过于频繁' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const settings = await getAiRuntimeSettings()
    if (!settings.hasApiKey) {
      return NextResponse.json({ error: '请先配置 API Key' }, { status: 400 })
    }

    const result = await fetchOpenAiCompatibleModels({
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
    })

    return NextResponse.json(result, {
      headers: {
        ...rateLimitHeaders(limitResult),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof AiBaseUrlValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('获取模型列表失败:', error)
    const message = error instanceof Error ? error.message : ''
    const isUpstreamError = message.includes('/models') || message.includes('HTTP')

    return NextResponse.json(
      {
        error: isUpstreamError
          ? '模型服务请求失败，请检查 Base URL、网络连通性和 API Key'
          : '获取模型列表失败',
      },
      { status: isUpstreamError ? 502 : 500 }
    )
  }
}
