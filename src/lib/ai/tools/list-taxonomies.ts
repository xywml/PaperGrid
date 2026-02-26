import { tool } from '@langchain/core/tools'
import { prisma } from '@/lib/prisma'
import { AiAgentToolRegistration } from '@/lib/ai/tools/types'

type ListTaxonomiesResult = {
  ok: boolean
  kind: 'category' | 'tag'
  total: number
  items: Array<{
    id: string
    name: string
    slug: string
    description?: string | null
    postCount?: number
  }>
  error?: string
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export const listTaxonomiesToolRegistration: AiAgentToolRegistration = {
  key: 'list_taxonomies',
  description: '统一分类/标签列表工具，通过 kind 参数选择 category 或 tag。',
  factory: async () => {
    return tool(
      async (params: {
        kind?: unknown
        query?: unknown
        limit?: unknown
        includePostCount?: unknown
      }) => {
        const kind = params.kind === 'tag' ? 'tag' : 'category'
        const query = normalizeText(params.query)
        const includePostCount = params.includePostCount !== false
        const requestedLimit =
          typeof params.limit === 'number' && Number.isFinite(params.limit)
            ? Math.round(params.limit)
            : 20
        const limit = clamp(requestedLimit, 1, 80)

        try {
          if (kind === 'category') {
            const categories = await prisma.category.findMany({
              where: query
                ? {
                    OR: [
                      { name: { contains: query } },
                      { slug: { contains: query } },
                      { description: { contains: query } },
                    ],
                  }
                : undefined,
              orderBy: {
                name: 'asc',
              },
              take: limit,
              select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                _count: includePostCount
                  ? {
                      select: {
                        posts: true,
                      },
                    }
                  : false,
              },
            })

            const payload: ListTaxonomiesResult = {
              ok: true,
              kind,
              total: categories.length,
              items: categories.map((item) => ({
                id: item.id,
                name: item.name,
                slug: item.slug,
                description: item.description,
                ...(includePostCount ? { postCount: item._count.posts } : {}),
              })),
            }
            return JSON.stringify(payload)
          }

          const tags = await prisma.tag.findMany({
            where: query
              ? {
                  OR: [{ name: { contains: query } }, { slug: { contains: query } }],
                }
              : undefined,
            orderBy: {
              name: 'asc',
            },
            take: limit,
            select: {
              id: true,
              name: true,
              slug: true,
              _count: includePostCount
                ? {
                    select: {
                      posts: true,
                    },
                  }
                : false,
            },
          })

          const payload: ListTaxonomiesResult = {
            ok: true,
            kind,
            total: tags.length,
            items: tags.map((item) => ({
              id: item.id,
              name: item.name,
              slug: item.slug,
              ...(includePostCount ? { postCount: item._count.posts } : {}),
            })),
          }
          return JSON.stringify(payload)
        } catch (error) {
          const payload: ListTaxonomiesResult = {
            ok: false,
            kind,
            total: 0,
            items: [],
            error: error instanceof Error ? error.message : 'list_taxonomies 执行失败',
          }
          return JSON.stringify(payload)
        }
      },
      {
        name: 'list_taxonomies',
        description:
          '统一查询分类和标签。kind=category|tag，支持关键词搜索、limit 和文章计数。默认 kind=category。',
        schema: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['category', 'tag'],
              description: '查询类型，category 或 tag，默认 category。',
            },
            query: {
              type: 'string',
              description: '可选，按名称/slug（分类还包含 description）模糊匹配。',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 80,
              description: '可选，返回数量上限。',
            },
            includePostCount: {
              type: 'boolean',
              description: '可选，是否返回文章计数，默认 true。',
            },
          },
          additionalProperties: false,
        },
      }
    )
  },
}
