'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { MessageSquare, Check, X, Trash2, Clock, Filter } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'

interface Comment {
  id: string
  content: string
  status: string
  createdAt: Date
  author: {
    id: string
    name: string | null
    email: string | null
    image: string | null
  } | null
  authorName?: string | null
  authorEmail?: string | null
  post: {
    id: string
    title: string
    slug: string
  }
}

export default function CommentsAdminPage() {
  const [comments, setComments] = useState<Comment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [defaultAvatarUrl, setDefaultAvatarUrl] = useState('')
  const { toast } = useToast()

  useEffect(() => {
    fetchComments()
  }, [page, statusFilter])

  useEffect(() => {
    fetch('/api/settings/public')
      .then((res) => res.json())
      .then((data) => setDefaultAvatarUrl(data?.['site.defaultAvatarUrl'] || ''))
      .catch((err) => console.error('Failed to load settings', err))
  }, [])

  const fetchComments = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(statusFilter && { status: statusFilter }),
      })
      const queryString = params.toString()
      const response = await fetch(`/api/admin/comments${queryString ? `?${queryString}` : ''}`)
      const data = await response.json()

      if (response.ok) {
        setComments(data.comments)
        setTotalPages(data.pagination.totalPages)
      } else {
        toast({
          title: '错误',
          description: data.error || '获取评论失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('获取评论失败:', error)
      toast({
        title: '错误',
        description: '获取评论失败',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const updateCommentStatus = async (id: string, status: string) => {
    try {
      const response = await fetch(`/api/admin/comments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      if (response.ok) {
        toast({
          title: '成功',
          description: `评论已${status === 'APPROVED' ? '审核通过' : '标记为待审核'}`,
        })
        fetchComments()
      } else {
        const data = await response.json()
        toast({
          title: '错误',
          description: data.error || '更新失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('更新评论失败:', error)
      toast({
        title: '错误',
        description: '更新失败',
        variant: 'destructive',
      })
    }
  }

  const deleteComment = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/comments/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast({
          title: '成功',
          description: '评论已删除',
        })
        fetchComments()
      } else {
        const data = await response.json()
        toast({
          title: '错误',
          description: data.error || '删除失败',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('删除评论失败:', error)
      toast({
        title: '错误',
        description: '删除失败',
        variant: 'destructive',
      })
    }
  }

  const getStatusBadge = (status: string) => {
    const statusMap = {
      APPROVED: { label: '已通过', variant: 'default' as const, color: 'bg-green-500' },
      PENDING: { label: '待审核', variant: 'secondary' as const, color: 'bg-yellow-500' },
      SPAM: { label: '垃圾评论', variant: 'destructive' as const, color: 'bg-red-500' },
      REJECTED: { label: '已拒绝', variant: 'outline' as const, color: 'bg-gray-500' },
    }
    const config = statusMap[status as keyof typeof statusMap] || statusMap.PENDING

    return (
      <Badge variant={config.variant} className={`${config.color} text-white hover:opacity-80`}>
        {config.label}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">评论管理</h1>
          <p className="text-muted-foreground">管理用户评论和审核状态</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium">筛选:</span>
            </div>
            <Select
              value={statusFilter || 'ALL'}
              onValueChange={(value) => setStatusFilter(value === 'ALL' ? '' : value)}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="所有状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">所有状态</SelectItem>
                <SelectItem value="PENDING">待审核</SelectItem>
                <SelectItem value="APPROVED">已通过</SelectItem>
                <SelectItem value="SPAM">垃圾评论</SelectItem>
                <SelectItem value="REJECTED">已拒绝</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Comments List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            评论列表 ({comments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex gap-4">
                    <div className="h-12 w-12 rounded-full bg-gray-200 dark:bg-gray-700" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-1/4 rounded bg-gray-200 dark:bg-gray-700" />
                      <div className="h-16 rounded bg-gray-200 dark:bg-gray-700" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="py-12 text-center">
              <MessageSquare className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <p className="text-gray-500 dark:text-gray-400">暂无评论</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => {
                const displayName = comment.author?.name || comment.authorName || '匿名用户'
                const avatarSrc =
                  comment.author?.image ||
                  (comment.author ? defaultAvatarUrl || undefined : undefined)
                const avatarFallback = displayName.trim().charAt(0).toUpperCase() || '?'
                return (
                  <div
                    key={comment.id}
                    className="flex flex-col gap-4 rounded-lg border p-4 transition-colors hover:bg-gray-50 sm:flex-row dark:hover:bg-gray-800/50"
                  >
                    {/* Avatar */}
                    <Avatar className="h-12 w-12 shrink-0">
                      <AvatarImage src={avatarSrc} />
                      <AvatarFallback className="border border-gray-900 bg-gray-50 font-serif text-gray-900 dark:border-white dark:bg-gray-800 dark:text-white">
                        {avatarFallback}
                      </AvatarFallback>
                    </Avatar>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {displayName}
                            </span>
                            <span className="text-gray-400">·</span>
                            <span className="text-sm break-all text-gray-500 dark:text-gray-400">
                              {comment.author?.email || comment.authorEmail || ''}
                            </span>
                            {getStatusBadge(comment.status)}
                          </div>
                          <p className="mb-2 line-clamp-2 text-gray-700 dark:text-gray-300">
                            {comment.content}
                          </p>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>
                                {formatDistanceToNow(new Date(comment.createdAt), {
                                  addSuffix: true,
                                  locale: zhCN,
                                })}
                              </span>
                            </div>
                            <Link
                              href={`/posts/${comment.post.slug}`}
                              className="hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              文章: {comment.post.title}
                            </Link>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                          {comment.status === 'PENDING' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="hover:border-green-700 hover:bg-green-50 hover:text-green-700"
                                onClick={() => updateCommentStatus(comment.id, 'APPROVED')}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="hover:border-red-700 hover:bg-red-50 hover:text-red-700"
                                onClick={() => updateCommentStatus(comment.id, 'REJECTED')}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="hover:border-red-700 hover:bg-red-50 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>删除评论</AlertDialogTitle>
                                <AlertDialogDescription>
                                  确定要删除这条评论吗？此操作不可撤销。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteComment(comment.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  确定删除
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                上一页
              </Button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                第 {page} / {totalPages} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                下一页
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
