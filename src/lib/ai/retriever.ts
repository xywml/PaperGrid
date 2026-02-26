import { prisma } from '@/lib/prisma'
import { searchAiChunksByQuery } from '@/lib/ai/vector-store'

export type RetrievedChunk = {
  postId: string
  slug: string
  title: string
  excerpt: string | null
  snippet: string
  score: number
  publishedAt: string | null
  isProtected: boolean
  url: string
}

type RetrieveOptions = {
  topK: number
  minScore: number
  includeProtected?: boolean
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function buildSnippet(content: string) {
  const normalized = normalizeWhitespace(content)
  if (!normalized) {
    return ''
  }

  if (normalized.length <= 220) {
    return normalized
  }

  return `${normalized.slice(0, 220)}...`
}

export async function retrieveRelevantPostChunks(
  query: string,
  options: RetrieveOptions
): Promise<RetrievedChunk[]> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    return []
  }

  const candidateCount = Math.max(options.topK * 6, options.topK)
  const vectorHits = await searchAiChunksByQuery(normalizedQuery, {
    topK: candidateCount,
  })

  if (!vectorHits.length) {
    return []
  }

  const postIds = Array.from(new Set(vectorHits.map((item) => item.postId).filter(Boolean)))
  if (!postIds.length) {
    return []
  }

  const posts = await prisma.post.findMany({
    where: {
      id: { in: postIds },
      status: 'PUBLISHED',
      ...(options.includeProtected ? {} : { isProtected: false }),
    },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      publishedAt: true,
      isProtected: true,
    },
  })

  const postMap = new Map(posts.map((post) => [post.id, post]))
  const bestChunkByPost = new Map<string, RetrievedChunk>()

  for (const hit of vectorHits) {
    const post = postMap.get(hit.postId)
    if (!post) {
      continue
    }

    const score = hit.score
    if (score < options.minScore) {
      continue
    }

    const existing = bestChunkByPost.get(post.id)
    if (existing && existing.score >= score) {
      continue
    }

    bestChunkByPost.set(post.id, {
      postId: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      snippet: buildSnippet(hit.content),
      score,
      publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
      isProtected: post.isProtected,
      url: `/posts/${post.slug}`,
    })
  }

  return Array.from(bestChunkByPost.values())
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : 0
      const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : 0
      return rightTime - leftTime
    })
    .slice(0, options.topK)
}
