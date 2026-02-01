'use client'

import { useState, useTransition } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { LogIn } from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'

interface CommentFormProps {
  postSlug: string
  allowGuest?: boolean
  onSuccess?: () => void
  parentId?: string | null
  onCancel?: () => void
  title?: string
  placeholder?: string
  compact?: boolean
  autoFocus?: boolean
  unlockToken?: string
}

export function CommentForm({
  postSlug,
  allowGuest,
  onSuccess,
  parentId,
  onCancel,
  title,
  placeholder,
  compact,
  autoFocus,
  unlockToken,
}: CommentFormProps) {
  const { data: session } = useSession()
  const [content, setContent] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [authorEmail, setAuthorEmail] = useState('')
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const formTitle = title || (parentId ? '回复评论' : '发表评论')
  const formPlaceholder = placeholder || '写下你的评论...'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!content.trim()) {
      toast({
        title: '错误',
        description: '评论内容不能为空',
        variant: 'destructive',
      })
      return
    }

    if (!session?.user && allowGuest) {
      const trimmedName = authorName.trim()
      const trimmedEmail = authorEmail.trim()
      if (!trimmedName || !trimmedEmail) {
        toast({
          title: '错误',
          description: '请填写昵称和联系邮箱',
          variant: 'destructive',
        })
        return
      }
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
      if (!emailOk) {
        toast({
          title: '错误',
          description: '邮箱格式不正确',
          variant: 'destructive',
        })
        return
      }
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/comments?slug=${postSlug}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(unlockToken ? { Authorization: `Bearer ${unlockToken}` } : {}),
          },
          body: JSON.stringify({
            content: content.trim(),
            authorName: session?.user ? undefined : authorName.trim(),
            authorEmail: session?.user ? undefined : authorEmail.trim(),
            parentId: parentId || undefined,
          }),
        })

        const data = await response.json()

        if (response.ok) {
          setContent('')
          setAuthorName('')
          setAuthorEmail('')
          toast({
            title: '成功',
            description: data.comment?.status === 'PENDING' ? '评论已提交，待审核' : '评论发表成功！',
          })
          onSuccess?.()
        } else {
          toast({
            title: '错误',
            description: data.error || '评论发表失败',
            variant: 'destructive',
          })
        }
      } catch (error) {
        console.error('提交评论失败:', error)
        toast({
          title: '错误',
          description: '评论发表失败，请稍后重试',
          variant: 'destructive',
        })
      }
    })
  }

  // 未登录状态
  if (!session && !allowGuest) {
    return (
      <Card className={compact ? 'p-4' : 'p-6'}>
        <div className="text-center py-8">
          <LogIn className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            登录后发表评论
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            请先登录账号后再发表评论
          </p>
          <Link href="/auth/signin">
            <Button>立即登录</Button>
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <Card className={compact ? 'p-3' : 'p-4 pt-3'}>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {formTitle}
      </h3>
      {!session && allowGuest && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
          未登录评论需提供昵称和联系邮箱，提交后默认进入审核。
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-2">
        {!session && allowGuest && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="你的昵称"
              maxLength={50}
              disabled={isPending}
            />
            <Input
              value={authorEmail}
              onChange={(e) => setAuthorEmail(e.target.value)}
              placeholder="联系邮箱"
              type="email"
              maxLength={100}
              disabled={isPending}
            />
          </div>
        )}
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={formPlaceholder}
          rows={4}
          maxLength={1000}
          disabled={isPending}
          className="resize-none"
          autoFocus={autoFocus}
        />
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {content.length}/1000
          </span>
          <div className="flex items-center gap-2">
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
                取消
              </Button>
            )}
            <Button type="submit" disabled={isPending || !content.trim()}>
              {isPending ? '发表中...' : (parentId ? '回复' : '发表评论')}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  )
}
