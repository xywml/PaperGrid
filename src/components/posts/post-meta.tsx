import type { ReactNode } from 'react'
import { Calendar, Clock, Lock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

interface PostMetaProps {
  publishedAt?: Date | string | null
  authorName?: string | null
  readingTime?: number | null
  isProtected?: boolean | null
}

export function PostMeta({
  publishedAt,
  authorName,
  readingTime,
  isProtected,
}: PostMetaProps) {
  const items: Array<{ key: string; content: ReactNode }> = [
    {
      key: 'date',
      content: (
        <>
          <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
          <time>
            {publishedAt
              ? formatDistanceToNow(new Date(publishedAt), {
                  addSuffix: true,
                  locale: zhCN,
                })
              : ''}
          </time>
        </>
      ),
    },
    {
      key: 'author',
      content: <span>{authorName ?? ''}</span>,
    },
    {
      key: 'reading',
      content: (
        <>
          <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
          <span>{readingTime || 1} 分钟阅读</span>
        </>
      ),
    },
  ]

  if (isProtected) {
    items.push({
      key: 'protected',
      content: (
        <span className="pg-lock-inline inline-flex items-center gap-1">
          <Lock className="h-3 w-3 sm:h-4 sm:w-4" />
          <span>加密</span>
        </span>
      ),
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400 sm:gap-x-3 sm:text-sm">
      {items.map((item, index) => (
        <span key={item.key} className="inline-flex items-center gap-1 whitespace-nowrap">
          {item.content}
          {index < items.length - 1 && <span className="mx-1 opacity-60">•</span>}
        </span>
      ))}
    </div>
  )
}
