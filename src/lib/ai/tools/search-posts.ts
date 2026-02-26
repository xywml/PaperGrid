import { tool } from '@langchain/core/tools'
import { retrieveRelevantPostChunks } from '@/lib/ai/retriever'
import { AiAgentToolRegistration } from '@/lib/ai/tools/types'

type SearchPostsToolResult = {
  ok: boolean
  query: string
  total: number
  citations: Array<{
    postId: string
    title: string
    slug: string
    url: string
    snippet: string
    score: number
  }>
  error?: string
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export const searchPostsToolRegistration: AiAgentToolRegistration = {
  key: 'search_posts',
  description: '检索站内文章知识库。',
  factory: async (context) => {
    return tool(
      async (params: { query?: unknown; topK?: unknown }) => {
        const query = typeof params.query === 'string' ? params.query.trim() : ''
        const requestedTopK =
          typeof params.topK === 'number' && Number.isFinite(params.topK)
            ? Math.round(params.topK)
            : context.ragTopK

        const safeTopK = clamp(requestedTopK, 1, 20)

        if (!query) {
          const payload: SearchPostsToolResult = {
            ok: false,
            query,
            total: 0,
            citations: [],
            error: 'query 不能为空',
          }

          return JSON.stringify(payload)
        }

        try {
          const hits = await retrieveRelevantPostChunks(query, {
            topK: safeTopK,
            minScore: context.ragMinScore,
            includeProtected: context.includeProtected,
          })

          const citations = hits.map((item) => ({
            postId: item.postId,
            title: item.title,
            slug: item.slug,
            url: item.url,
            snippet: item.snippet,
            score: item.score,
          }))

          const payload: SearchPostsToolResult = {
            ok: true,
            query,
            total: citations.length,
            citations,
          }

          return JSON.stringify(payload)
        } catch (error) {
          const payload: SearchPostsToolResult = {
            ok: false,
            query,
            total: 0,
            citations: [],
            error: error instanceof Error ? error.message : '站内检索失败',
          }

          return JSON.stringify(payload)
        }
      },
      {
        name: 'search_posts',
        description:
          '检索站内文章知识库。仅当问题依赖本站文章、博客内容、作者已发布内容时调用。',
        schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '用于站内文章检索的查询语句，应包含关键事实或主题',
            },
            topK: {
              type: 'integer',
              minimum: 1,
              maximum: 20,
              description: '可选，返回结果数量，默认使用系统配置',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      }
    )
  },
}
