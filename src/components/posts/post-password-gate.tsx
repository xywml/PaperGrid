'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface PostPasswordGateProps {
  slug: string
  title: string
  excerpt?: string | null
  onUnlock?: (payload: { token?: string; postId?: string; maxAge?: number }) => void
}

export function PostPasswordGate({ slug, title, excerpt, onUnlock }: PostPasswordGateProps) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = password.trim()
    if (!trimmed) {
      setError('请输入密码')
      return
    }

    startTransition(async () => {
      setError('')
      try {
        const res = await fetch('/api/posts/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, password: trimmed }),
        })
        const data = await res.json()
        if (res.ok) {
          if (onUnlock) {
            onUnlock(data || {})
          } else {
            router.refresh()
          }
        } else {
          setError(data.error || '密码错误')
        }
      } catch (err) {
        console.error('解锁失败:', err)
        setError('解锁失败，请稍后重试')
      }
    })
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 lg:px-8">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="pg-lock-circle mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {title}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            此文章已加密，输入密码后可查看
          </p>
          {excerpt && (
            <p className="mt-3 line-clamp-3 text-sm text-gray-600 dark:text-gray-300">
              {excerpt}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <Input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError('')
            }}
            placeholder="请输入文章密码"
            disabled={isPending}
          />
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? '验证中...' : '解锁查看'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
