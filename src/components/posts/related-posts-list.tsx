'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Eye, Lock } from 'lucide-react'

export type RelatedPostsListItem = {
  id: string
  title: string
  slug: string
  publishedLabel: string
  isProtected?: boolean
  viewCount?: {
    count: number
  } | null
}

function buildInitialCounts(posts: RelatedPostsListItem[]) {
  return Object.fromEntries(posts.map((post) => [post.slug, post.viewCount?.count || 0] as const))
}

export function RelatedPostsList({ posts }: { posts: RelatedPostsListItem[] }) {
  const [counts, setCounts] = useState<Record<string, number>>(() => buildInitialCounts(posts))
  const slugKey = useMemo(() => posts.map((post) => post.slug).join(','), [posts])

  useEffect(() => {
    setCounts(buildInitialCounts(posts))
  }, [posts])

  useEffect(() => {
    const slugs = Array.from(new Set(posts.map((post) => post.slug.trim()).filter(Boolean)))
    if (slugs.length === 0) {
      return
    }

    const controller = new AbortController()

    void fetch(`/api/posts/views?slugs=${encodeURIComponent(slugs.join(','))}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || typeof data !== 'object' || !('counts' in data)) {
          return
        }

        const nextCounts = data.counts
        if (!nextCounts || typeof nextCounts !== 'object') {
          return
        }

        setCounts((current) => {
          const merged = { ...current }
          for (const slug of slugs) {
            const value = (nextCounts as Record<string, unknown>)[slug]
            if (typeof value === 'number' && Number.isFinite(value)) {
              merged[slug] = value
            }
          }
          return merged
        })
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      })

    return () => {
      controller.abort()
    }
  }, [posts, slugKey])

  return (
    <ul className="space-y-3">
      {posts.map((related) => (
        <li key={related.id}>
          <Link href={`/posts/${related.slug}`} className="group block">
            <p className="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
              {related.title}
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>{related.publishedLabel}</span>
              <span>•</span>
              <Eye className="inline h-3 w-3" />
              <span>{counts[related.slug] ?? related.viewCount?.count ?? 0}</span>
              {related.isProtected && (
                <>
                  <span>•</span>
                  <span className="pg-lock-inline inline-flex items-center gap-1">
                    <Lock className="inline h-3 w-3" />
                    <span>加密</span>
                  </span>
                </>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
