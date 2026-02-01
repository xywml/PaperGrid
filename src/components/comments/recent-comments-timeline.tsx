import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { prisma } from '@/lib/prisma'
import { getSetting } from '@/lib/settings'

export async function RecentCommentsTimeline({ limit = 5 }: { limit?: number } = {}) {
  const commentsEnabled = (await getSetting<boolean>('comments.enabled', true)) ?? true
  if (!commentsEnabled) return null

  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 10) : 5
  const comments = await prisma.comment.findMany({
    where: { status: 'APPROVED', post: { isProtected: false } },
    orderBy: { createdAt: 'desc' },
    take: safeLimit,
    select: {
      id: true,
      content: true,
      createdAt: true,
      authorName: true,
      author: { select: { name: true } },
      post: { select: { title: true, slug: true } },
    },
  })

  if (comments.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        暂无最新评论
      </p>
    )
  }

  return (
    <div className="relative pl-4">
      <div className="absolute left-1 top-1 bottom-1 w-px bg-gray-200 dark:bg-gray-700" />
      <div className="space-y-4">
        {comments.map((comment) => {
          const author = comment.author?.name || comment.authorName || '匿名用户'
          const summary = comment.content.length > 60 ? `${comment.content.slice(0, 60)}…` : comment.content
          return (
            <div key={comment.id} className="relative">
              <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-gray-900 dark:bg-white" />
              <div className="pl-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: zhCN })} · {author}
                </p>
                <Link
                  href={`/posts/${comment.post.slug}`}
                  className="block text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                >
                  {comment.post.title}
                </Link>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {summary}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
