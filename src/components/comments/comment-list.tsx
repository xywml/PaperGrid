'use client'

import { useEffect, useState } from 'react'
import { Calendar } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CommentForm } from './comment-form'

interface Author {
  name: string | null
  image: string | null
}

interface Comment {
  id: string
  content: string
  createdAt: Date
  author: Author | null
  authorName?: string | null
  parentId?: string | null
}

interface CommentListProps {
  postSlug: string
  refreshTrigger?: number
  defaultAvatarUrl?: string
  allowGuest?: boolean
  unlockToken?: string
}

export function CommentList({
  postSlug,
  refreshTrigger,
  defaultAvatarUrl = '',
  allowGuest,
  unlockToken,
}: CommentListProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // 获取评论列表
  const fetchComments = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/comments?slug=${postSlug}`, {
        headers: unlockToken ? { Authorization: `Bearer ${unlockToken}` } : undefined,
      })
      const data = await response.json()

      if (response.ok) {
        setComments(data.comments)
      } else if (response.status === 401 || response.status === 403) {
        setComments([])
      }
    } catch (error) {
      console.error('获取评论失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchComments()
  }, [postSlug, refreshTrigger, unlockToken])

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-20 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (comments.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">还没有评论，快来发表第一条评论吧！</p>
      </Card>
    )
  }

  const sortByDate = (a: Comment, b: Comment) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()

  const repliesMap = new Map<string, Comment[]>()
  const rootComments: Comment[] = []

  for (const comment of comments) {
    if (comment.parentId) {
      const list = repliesMap.get(comment.parentId) || []
      list.push(comment)
      repliesMap.set(comment.parentId, list)
    } else {
      rootComments.push(comment)
    }
  }

  rootComments.sort(sortByDate)
  for (const list of repliesMap.values()) {
    list.sort(sortByDate)
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        评论 ({comments.length})
      </h3>
      <div className="space-y-4">
        {rootComments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            replies={repliesMap.get(comment.id) || []}
            repliesMap={repliesMap}
            defaultAvatarUrl={defaultAvatarUrl}
            postSlug={postSlug}
            allowGuest={allowGuest}
            unlockToken={unlockToken}
            onReplySuccess={fetchComments}
          />
        ))}
      </div>
    </div>
  )
}

function CommentItem({
  comment,
  replies,
  repliesMap,
  defaultAvatarUrl,
  postSlug,
  allowGuest,
  onReplySuccess,
  unlockToken,
  depth = 0,
}: {
  comment: Comment
  replies: Comment[]
  repliesMap: Map<string, Comment[]>
  defaultAvatarUrl: string
  postSlug: string
  allowGuest?: boolean
  onReplySuccess?: () => void
  unlockToken?: string
  depth?: number
}) {
  const [showReplyForm, setShowReplyForm] = useState(false)
  const displayName = comment.author?.name || comment.authorName || '匿名用户'
  const avatarSrc =
    comment.author?.image || (comment.author ? defaultAvatarUrl || undefined : undefined)
  const getInitial = (name: string) => {
    if (!name) return '?'
    return name.trim().charAt(0).toUpperCase() || '?'
  }

  return (
    <div className="space-y-3">
      <Card id={`comment-${comment.id}`} className="p-4 transition-shadow hover:shadow-md">
        <div className="flex items-start gap-3">
          {/* 头像 */}
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={avatarSrc} />
            <AvatarFallback className="border border-gray-900 bg-gray-50 font-serif text-gray-900 dark:border-white dark:bg-gray-800 dark:text-white">
              {getInitial(displayName)}
            </AvatarFallback>
          </Avatar>

          {/* 评论内容 */}
          <div className="min-w-0 flex-1">
            {/* 作者名和时间 */}
            <div className="mb-2 flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-white">{displayName}</span>
              <span className="text-gray-400">·</span>
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Calendar className="h-3 w-3" />
                <span>
                  {formatDistanceToNow(new Date(comment.createdAt), {
                    addSuffix: true,
                    locale: zhCN,
                  })}
                </span>
              </div>
            </div>

            {/* 评论内容 */}
            <p className="break-words whitespace-pre-wrap text-gray-700 dark:text-gray-300">
              {comment.content}
            </p>

            {/* 操作区 */}
            <div className="mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                onClick={() => setShowReplyForm((prev) => !prev)}
              >
                {showReplyForm ? '取消回复' : '回复'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {showReplyForm && (
        <div className="ml-6">
          <CommentForm
            postSlug={postSlug}
            allowGuest={allowGuest}
            parentId={comment.id}
            compact
            autoFocus
            unlockToken={unlockToken}
            onCancel={() => setShowReplyForm(false)}
            onSuccess={() => {
              setShowReplyForm(false)
              onReplySuccess?.()
            }}
          />
        </div>
      )}

      {replies.length > 0 && (
        <div className={`space-y-3 border-l pl-4 ${depth > 0 ? 'ml-6' : 'ml-4'}`}>
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              replies={repliesMap.get(reply.id) || []}
              repliesMap={repliesMap}
              defaultAvatarUrl={defaultAvatarUrl}
              postSlug={postSlug}
              allowGuest={allowGuest}
              unlockToken={unlockToken}
              onReplySuccess={onReplySuccess}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
