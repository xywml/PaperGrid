'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Calendar, Clock, Eye, User, ArrowLeft, ArrowRight, Edit3, Scissors, Lock } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TableOfContents, type HeadingItem } from '@/components/posts/table-of-contents'
import { CommentSection } from '@/components/comments/comment-section'
import { PostTitleSync } from '@/components/posts/post-title-sync'
import { PostPasswordGate } from '@/components/posts/post-password-gate'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ViewCount } from '@/components/posts/view-count'
import { extractHeadingsFromMarkdown } from '@/lib/markdown'
import { getReadingContentClasses, type MobileReadingBackground } from '@/lib/reading-style'
import { MDXContentClient } from '@/components/posts/mdx-content-client'
import { isInternalImageUrl } from '@/lib/image-url'

const UNLOCK_STORAGE_PREFIX = 'pg_post_unlock_'

type PostTagItem = {
  tag: {
    id: string
    name: string
    slug: string
  }
}

type ProtectedPost = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  coverImage: string | null
  publishedLabel: string
  updatedAtLabel: string | null
  publishedAt: string | Date | null
  updatedAt: string | Date
  readingTime: number | null
  categoryId: string | null
  isProtected: boolean
  author: { name: string | null; image: string | null }
  category: { name: string; slug: string } | null
  postTags: PostTagItem[]
  viewCount: { count: number } | null
}

type RelatedPost = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  coverImage: string | null
  publishedLabel: string
  publishedAt: string | Date | null
  isProtected?: boolean
  viewCount?: { count: number } | null
}

type SimplePost = { id: string; title: string; slug: string } | null

interface ProtectedPostPageProps {
  post: ProtectedPost
  prevPost: SimplePost
  nextPost: SimplePost
  relatedPosts: RelatedPost[]
  commentsEnabled: boolean
  allowGuest: boolean
  ownerName: string
  ownerRole: string
  defaultAvatarUrl: string
  mobileReadingBackground: MobileReadingBackground
}

function getStorageKey(postId: string) {
  return `${UNLOCK_STORAGE_PREFIX}${postId}`
}

export function ProtectedPostPage({
  post,
  prevPost,
  nextPost,
  relatedPosts,
  commentsEnabled,
  allowGuest,
  ownerName,
  ownerRole,
  defaultAvatarUrl,
  mobileReadingBackground,
}: ProtectedPostPageProps) {
  const { cardClassName: contentCardClassName, contentClassName: contentPaddingClassName } = getReadingContentClasses(mobileReadingBackground)
  const [content, setContent] = useState<string | null>(null)
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [unlockToken, setUnlockToken] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [loadError, setLoadError] = useState('')

  const loadContent = useCallback(async (token: string) => {
    setFetching(true)
    setLoadError('')
    try {
      const res = await fetch(`/api/posts/protected?slug=${post.slug}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          try {
            sessionStorage.removeItem(getStorageKey(post.id))
          } catch {
            // ignore
          }
          setUnlockToken(null)
        }
        setContent(null)
        setLoadError(data.error || '解锁已失效，请重新输入密码')
        return
      }
      const nextContent = typeof data.content === 'string' ? data.content : ''
      setContent(nextContent)
      const nextHeadings = extractHeadingsFromMarkdown(nextContent, 3).map((heading, index) => ({
        id: `heading-${index}`,
        text: heading.text,
        level: heading.level,
      }))
      setHeadings(nextHeadings)
    } catch (error) {
      console.error('加载受保护内容失败:', error)
      setLoadError('加载内容失败，请稍后重试')
    } finally {
      setFetching(false)
    }
  }, [post.id, post.slug])

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(getStorageKey(post.id))
      if (stored) {
        setUnlockToken(stored)
        loadContent(stored)
      }
    } catch {
      // ignore
    }
  }, [post.id, loadContent])

  const handleUnlock = useCallback((payload: { token?: string }) => {
    if (!payload.token) return
    try {
      sessionStorage.setItem(getStorageKey(post.id), payload.token)
    } catch {
      // ignore
    }
    setUnlockToken(payload.token)
    loadContent(payload.token)
  }, [post.id, loadContent])

  const canShowContent = content !== null

  return (
    <div className="min-h-screen">
      <PostTitleSync title={post.title} />

      {/* 文章头部 */}
      <article className="py-12 sm:py-16 bg-transparent">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {/* 返回按钮 */}
          <Link href="/posts" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回文章列表
          </Link>

          {/* 文章标题 */}
          <h1 className="text-3xl font-serif font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl md:text-5xl mb-6">
            {post.title}
          </h1>

          {/* 文章摘要 */}
          {post.excerpt && (
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
              {post.excerpt}
            </p>
          )}

          {/* 文章元信息 */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{post.author.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <time>{post.publishedLabel}</time>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>{post.readingTime || 1} 分钟阅读</span>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span>
                {canShowContent ? (
                  <ViewCount slug={post.slug} initialCount={post.viewCount?.count || 0} />
                ) : (
                  <span>{post.viewCount?.count || 0}</span>
                )}{" "}
                次阅读
              </span>
            </div>
            {post.updatedAtLabel && (
              <div className="flex items-center gap-2 text-primary font-medium">
                <Edit3 className="h-4 w-4" />
                <span>
                  最后编辑于 {post.updatedAtLabel}
                </span>
              </div>
            )}
            <div className="pg-lock-indicator text-xs">
              <Lock className="h-3 w-3" />
              加密文章
            </div>
          </div>

          {/* 分类和标签 */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {post.category && (
              <Link href={`/posts?category=${post.category.slug}`}>
                <Badge variant="secondary" className="pg-public-badge-secondary cursor-pointer">
                  {post.category.name}
                </Badge>
              </Link>
            )}
            {post.postTags.map((pt) => (
              <Link key={pt.tag.id} href={`/posts?tag=${pt.tag.slug}`}>
                <Badge variant="outline" className="pg-public-badge-outline cursor-pointer">
                  #{pt.tag.name}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      </article>

      {/* 分割线与装饰 */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mb-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="pg-post-divider-line w-full border-t border-dashed border-gray-300 dark:border-gray-700"></div>
          </div>
          <div className="relative flex justify-start">
            <span className="pg-post-divider-icon pr-3 text-gray-400 dark:text-gray-600">
              <Scissors className="h-5 w-5" />
            </span>
          </div>
        </div>
      </div>

      {/* 文章内容 */}
      <section className="py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* 主要内容 */}
            <div className="lg:col-span-3">
              {/* 封面图 */}
              {post.coverImage && (
                <div className="mb-8 overflow-hidden rounded-lg">
                  {isInternalImageUrl(post.coverImage) ? (
                    <Image
                      src={post.coverImage}
                      alt={post.title}
                      width={1600}
                      height={900}
                      priority
                      sizes="(min-width: 1280px) 1152px, (min-width: 1024px) 896px, 100vw"
                      className="h-auto w-full object-cover"
                    />
                  ) : (
                    <img
                      src={post.coverImage}
                      alt={post.title}
                      className="w-full object-cover"
                      loading="eager"
                      decoding="async"
                    />
                  )}
                </div>
              )}

              {/* MDX内容 / 密码门禁 */}
              <Card className={contentCardClassName}>
                <CardContent className={contentPaddingClassName}>
                  {canShowContent ? (
                    <MDXContentClient content={content} />
                  ) : (
                    <>
                      <PostPasswordGate
                        slug={post.slug}
                        title={post.title}
                        excerpt={post.excerpt}
                        onUnlock={handleUnlock}
                      />
                      {fetching && (
                        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                          正在加载内容...
                        </p>
                      )}
                      {loadError && (
                        <p className="mt-4 text-sm text-red-600 dark:text-red-400 text-center">
                          {loadError}
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* 上一篇/下一篇导航 */}
              <Card className="mt-8">
                <CardContent className="p-6">
                  <div className="grid grid-cols-2 gap-4">
                    {prevPost ? (
                      <Link
                        href={`/posts/${prevPost.slug}`}
                        className="group flex items-start gap-3 text-left"
                      >
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">上一篇</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 line-clamp-2">
                            {prevPost.title}
                          </p>
                        </div>
                        <ArrowLeft className="h-5 w-5 text-gray-400 group-hover:text-blue-600" />
                      </Link>
                    ) : (
                      <div />
                    )}
                    {nextPost ? (
                      <Link
                        href={`/posts/${nextPost.slug}`}
                        className="group flex items-start gap-3 text-right"
                      >
                        <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">下一篇</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 line-clamp-2">
                            {nextPost.title}
                          </p>
                        </div>
                      </Link>
                    ) : (
                      <div />
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 评论区 */}
              {commentsEnabled && canShowContent && (
                <div className="mt-8">
                  <CommentSection
                    postSlug={post.slug}
                    allowGuest={!!allowGuest}
                    defaultAvatarUrl={defaultAvatarUrl || undefined}
                    unlockToken={unlockToken || undefined}
                  />
                </div>
              )}
            </div>

            {/* 侧边栏 */}
            <div className="lg:col-span-1">
              {/* 目录 */}
              <div className="sticky top-20">
                <TableOfContents headings={headings} />

                {/* 作者信息 */}
                <Card className="mt-6">
                  <CardHeader>
                    <h3 className="font-semibold">作者</h3>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12 border-2 border-gray-900 dark:border-white">
                        <AvatarImage src={defaultAvatarUrl || post.author.image || undefined} />
                        <AvatarFallback className="bg-gray-50 dark:bg-gray-800 text-lg font-serif font-bold text-gray-900 dark:text-white">
                          {(ownerName || post.author.name || '千叶').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {ownerName || post.author.name || '千叶'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {ownerRole || '全栈开发者'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 相关文章 */}
                {relatedPosts.length > 0 && (
                  <Card className="mt-6">
                    <CardHeader>
                      <h3 className="font-semibold">相关文章</h3>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-3">
                        {relatedPosts.map((related) => (
                          <li key={related.id}>
                            <Link
                              href={`/posts/${related.slug}`}
                              className="group block"
                            >
                              <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 line-clamp-2">
                                {related.title}
                              </p>
                              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <span>{related.publishedLabel}</span>
                                <span>•</span>
                                <Eye className="inline h-3 w-3" />
                                <span>{related.viewCount?.count || 0}</span>
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
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
