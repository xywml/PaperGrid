import { PostStatus, type Prisma } from '@prisma/client'
import { tool } from '@langchain/core/tools'
import { prisma } from '@/lib/prisma'
import { AiAgentToolRegistration } from '@/lib/ai/tools/types'

type QueryPostsResult = {
  ok: boolean
  action: 'count' | 'list' | 'get'
  filters?: {
    status: 'ALL' | PostStatus
    locale: string | null
    categorySlug: string | null
    tagSlug: string | null
    search: string | null
    includeProtected: boolean
  }
  count?: {
    total: number
    byStatus: {
      published: number
      draft: number
      archived: number
    }
    protected: number
  }
  list?: {
    total: number
    limit: number
    offset: number
    items: Array<{
      id: string
      title: string
      slug: string
      status: string
      locale: string
      isProtected: boolean
      publishedAt: string | null
      updatedAt: string
      category: { id: string; name: string; slug: string } | null
      tags: Array<{ id: string; name: string; slug: string }>
    }>
  }
  post?: {
    id: string
    title: string
    slug: string
    status: string
    locale: string
    isProtected: boolean
    excerpt: string | null
    publishedAt: string | null
    updatedAt: string
    category: { id: string; name: string; slug: string } | null
    tags: Array<{ id: string; name: string; slug: string }>
    content?: string
    contentChars?: number
    contentTruncated?: boolean
  } | null
  error?: string
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeStatus(value: unknown): 'ALL' | PostStatus {
  if (value === PostStatus.PUBLISHED || value === PostStatus.DRAFT || value === PostStatus.ARCHIVED) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase()
    if (normalized === 'PUBLISHED') return PostStatus.PUBLISHED
    if (normalized === 'DRAFT') return PostStatus.DRAFT
    if (normalized === 'ARCHIVED') return PostStatus.ARCHIVED
  }

  return 'ALL'
}

function buildPostWhereInput(args: {
  status: 'ALL' | PostStatus
  locale: string | null
  categorySlug: string | null
  tagSlug: string | null
  search: string | null
  includeProtected: boolean
}): Prisma.PostWhereInput {
  return {
    ...(args.status === 'ALL' ? {} : { status: args.status }),
    ...(args.locale ? { locale: args.locale } : {}),
    ...(args.categorySlug ? { category: { slug: args.categorySlug } } : {}),
    ...(args.tagSlug ? { postTags: { some: { tag: { slug: args.tagSlug } } } } : {}),
    ...(args.search
      ? {
          OR: [{ title: { contains: args.search } }, { excerpt: { contains: args.search } }],
        }
      : {}),
    ...(args.includeProtected ? {} : { isProtected: false }),
  }
}

function trimContent(content: string, maxChars: number) {
  if (content.length <= maxChars) {
    return {
      content,
      contentChars: content.length,
      contentTruncated: false,
    }
  }

  return {
    content: `${content.slice(0, maxChars)}\n\n...[内容已截断]`,
    contentChars: content.length,
    contentTruncated: true,
  }
}

export const queryPostsToolRegistration: AiAgentToolRegistration = {
  key: 'query_posts',
  description: '统一文章工具：count/list/get 三种动作，减少工具切换与上下文成本。',
  approvalPolicy: {
    requiredWhen: (args) => args.action === 'get' && args.includeContent === true,
    reason: '读取文章正文属于高上下文操作，需人工批准后执行。',
  },
  factory: async (context) => {
    return tool(
      async (params: {
        action?: unknown
        status?: unknown
        locale?: unknown
        categorySlug?: unknown
        tagSlug?: unknown
        search?: unknown
        includeProtected?: unknown
        limit?: unknown
        offset?: unknown
        postId?: unknown
        slug?: unknown
        includeContent?: unknown
        contentMaxChars?: unknown
      }) => {
        const action =
          params.action === 'count' || params.action === 'list' || params.action === 'get'
            ? params.action
            : 'list'

        const status = normalizeStatus(params.status)
        const locale = normalizeText(params.locale) || null
        const categorySlug = normalizeText(params.categorySlug) || null
        const tagSlug = normalizeText(params.tagSlug) || null
        const search = normalizeText(params.search) || null
        const includeProtected = context.includeProtected && params.includeProtected === true

        const where = buildPostWhereInput({
          status,
          locale,
          categorySlug,
          tagSlug,
          search,
          includeProtected,
        })

        try {
          if (action === 'count') {
            const [total, grouped, protectedCount] = await Promise.all([
              prisma.post.count({ where }),
              prisma.post.groupBy({
                by: ['status'],
                where,
                _count: {
                  _all: true,
                },
              }),
              prisma.post.count({
                where: {
                  ...where,
                  isProtected: true,
                },
              }),
            ])

            const byStatus = {
              published: 0,
              draft: 0,
              archived: 0,
            }
            for (const row of grouped) {
              if (row.status === PostStatus.PUBLISHED) {
                byStatus.published = row._count._all
              } else if (row.status === PostStatus.DRAFT) {
                byStatus.draft = row._count._all
              } else if (row.status === PostStatus.ARCHIVED) {
                byStatus.archived = row._count._all
              }
            }

            const payload: QueryPostsResult = {
              ok: true,
              action,
              filters: {
                status,
                locale,
                categorySlug,
                tagSlug,
                search,
                includeProtected,
              },
              count: {
                total,
                byStatus,
                protected: protectedCount,
              },
            }
            return JSON.stringify(payload)
          }

          if (action === 'list') {
            const requestedLimit =
              typeof params.limit === 'number' && Number.isFinite(params.limit)
                ? Math.round(params.limit)
                : 10
            const requestedOffset =
              typeof params.offset === 'number' && Number.isFinite(params.offset)
                ? Math.round(params.offset)
                : 0
            const limit = clamp(requestedLimit, 1, 50)
            const offset = clamp(requestedOffset, 0, 2000)

            const [total, posts] = await Promise.all([
              prisma.post.count({ where }),
              prisma.post.findMany({
                where,
                orderBy: {
                  updatedAt: 'desc',
                },
                skip: offset,
                take: limit,
                select: {
                  id: true,
                  title: true,
                  slug: true,
                  status: true,
                  locale: true,
                  isProtected: true,
                  publishedAt: true,
                  updatedAt: true,
                  category: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                  postTags: {
                    select: {
                      tag: {
                        select: {
                          id: true,
                          name: true,
                          slug: true,
                        },
                      },
                    },
                  },
                },
              }),
            ])

            const payload: QueryPostsResult = {
              ok: true,
              action,
              filters: {
                status,
                locale,
                categorySlug,
                tagSlug,
                search,
                includeProtected,
              },
              list: {
                total,
                limit,
                offset,
                items: posts.map((post) => ({
                  id: post.id,
                  title: post.title,
                  slug: post.slug,
                  status: post.status,
                  locale: post.locale,
                  isProtected: post.isProtected,
                  publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
                  updatedAt: post.updatedAt.toISOString(),
                  category: post.category,
                  tags: post.postTags.map((item) => item.tag),
                })),
              },
            }
            return JSON.stringify(payload)
          }

          const postId = normalizeText(params.postId)
          const slug = normalizeText(params.slug)

          if (!postId && !slug) {
            const payload: QueryPostsResult = {
              ok: false,
              action,
              post: null,
              error: 'action=get 时，postId 或 slug 至少提供一个',
            }
            return JSON.stringify(payload)
          }

          if (postId && slug) {
            const payload: QueryPostsResult = {
              ok: false,
              action,
              post: null,
              error: 'postId 与 slug 不能同时提供',
            }
            return JSON.stringify(payload)
          }

          const includeContent = params.includeContent === true
          const requestedChars =
            typeof params.contentMaxChars === 'number' && Number.isFinite(params.contentMaxChars)
              ? Math.round(params.contentMaxChars)
              : 4000
          const contentMaxChars = clamp(requestedChars, 200, 12000)

          const post = await prisma.post.findFirst({
            where: {
              ...(postId ? { id: postId } : { slug }),
              ...(includeProtected ? {} : { isProtected: false }),
            },
            select: {
              id: true,
              title: true,
              slug: true,
              status: true,
              locale: true,
              isProtected: true,
              excerpt: true,
              content: true,
              publishedAt: true,
              updatedAt: true,
              category: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
              postTags: {
                select: {
                  tag: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              },
            },
          })

          if (!post) {
            const payload: QueryPostsResult = {
              ok: false,
              action,
              post: null,
              error: '文章不存在或当前会话不可访问',
            }
            return JSON.stringify(payload)
          }

          const trimmed = includeContent ? trimContent(post.content, contentMaxChars) : null
          const payload: QueryPostsResult = {
            ok: true,
            action,
            post: {
              id: post.id,
              title: post.title,
              slug: post.slug,
              status: post.status,
              locale: post.locale,
              isProtected: post.isProtected,
              excerpt: post.excerpt,
              publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
              updatedAt: post.updatedAt.toISOString(),
              category: post.category,
              tags: post.postTags.map((item) => item.tag),
              ...(trimmed ? trimmed : {}),
            },
          }
          return JSON.stringify(payload)
        } catch (error) {
          const payload: QueryPostsResult = {
            ok: false,
            action,
            error: error instanceof Error ? error.message : 'query_posts 执行失败',
          }
          return JSON.stringify(payload)
        }
      },
      {
        name: 'query_posts',
        description:
          '统一文章查询工具。action=count/list/get：支持统计、分页列表、按 id/slug 获取详情与可选正文。默认不包含受保护文章。',
        schema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['count', 'list', 'get'],
              description: '动作类型：count 统计、list 分页列表、get 获取单篇。默认 list。',
            },
            status: {
              type: 'string',
              enum: ['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'],
              description: '可选，文章状态过滤。',
            },
            locale: {
              type: 'string',
              description: '可选，语言过滤，如 zh / en。',
            },
            categorySlug: {
              type: 'string',
              description: '可选，分类 slug 过滤。',
            },
            tagSlug: {
              type: 'string',
              description: '可选，标签 slug 过滤。',
            },
            search: {
              type: 'string',
              description: '可选，按标题或摘要模糊搜索。',
            },
            includeProtected: {
              type: 'boolean',
              description: '可选，是否包含受保护文章；仅在当前会话允许时生效。',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              description: 'action=list 时可选，分页大小。',
            },
            offset: {
              type: 'integer',
              minimum: 0,
              maximum: 2000,
              description: 'action=list 时可选，偏移量。',
            },
            postId: {
              type: 'string',
              description: 'action=get 时可选，与 slug 二选一。',
            },
            slug: {
              type: 'string',
              description: 'action=get 时可选，与 postId 二选一。',
            },
            includeContent: {
              type: 'boolean',
              description: 'action=get 时可选，是否返回正文。默认 false。',
            },
            contentMaxChars: {
              type: 'integer',
              minimum: 200,
              maximum: 12000,
              description: 'action=get 且 includeContent=true 时可选，正文最大字符数。',
            },
          },
          additionalProperties: false,
        },
      }
    )
  },
}
