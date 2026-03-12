import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MDXContent } from '@/components/posts/mdx-content'
import {
  Calendar,
  Clock,
  Eye,
  User,
  ArrowLeft,
  ArrowRight,
  Edit3,
  Scissors,
} from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import Image from 'next/image'
import { TableOfContents, type HeadingItem } from '@/components/posts/table-of-contents'
import { CommentSection } from '@/components/comments/comment-section'
import { PostTitleSync } from '@/components/posts/post-title-sync'
import { getPostPageSettings } from '@/lib/settings'
import { getReadingContentClasses, normalizeMobileReadingBackground } from '@/lib/reading-style'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ViewCount } from '@/components/posts/view-count'
import { RelatedPostsList } from '@/components/posts/related-posts-list'
import { extractHeadingsFromMarkdown } from '@/lib/markdown'
import { ProtectedPostPage } from '@/components/posts/protected-post-page'
import { isInternalImageUrl } from '@/lib/image-url'
import { toCanonicalPath } from '@/lib/seo'
import {
  getPublicPostPageData,
  getPublishedPostBySlug,
  getPublishedPostSlugs,
} from '@/lib/public-post-page'

export const revalidate = false
export const dynamicParams = true

interface PostPageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateStaticParams() {
  const posts = await getPublishedPostSlugs()
  return posts.map((post) => ({
    slug: post.slug,
  }))
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params

  const postPageSettings = await getPostPageSettings()
  const commentsEnabled = postPageSettings.commentsEnabled
  const allowGuest = postPageSettings.allowGuest
  const ownerName = postPageSettings.ownerName
  const defaultAvatarUrl = postPageSettings.defaultAvatarUrl
  const ownerRole = postPageSettings.ownerRole
  const mobileReadingBackground = normalizeMobileReadingBackground(
    postPageSettings.mobileReadingBackground
  )
  const { cardClassName: contentCardClassName, contentClassName: contentPaddingClassName } =
    getReadingContentClasses(mobileReadingBackground)

  const formatPublishedAtLabel = (value: string | Date | null | undefined) => {
    if (!value) return ''
    return format(new Date(value), 'yyyy-MM-dd HH:mm')
  }

  const formatUpdatedAtLabel = (
    updatedAt: string | Date | null | undefined,
    publishedAt: string | Date | null | undefined
  ) => {
    if (!updatedAt || !publishedAt) return null
    if (new Date(updatedAt).getTime() - new Date(publishedAt).getTime() <= 60000) return null
    return format(new Date(updatedAt), 'yyyy-MM-dd HH:mm')
  }

  const postData = await getPublicPostPageData(slug)

  if (!postData) {
    notFound()
  }

  const { post: basePost, prevPost, nextPost, relatedPosts } = postData

  if (basePost.isProtected) {
    const { content, ...safePost } = basePost
    void content
    const safePostWithLabels = {
      ...safePost,
      publishedLabel: formatPublishedAtLabel(safePost.publishedAt),
      updatedAtLabel: formatUpdatedAtLabel(safePost.updatedAt, safePost.publishedAt),
    }
    const relatedPostsWithLabels = relatedPosts.map((item) => ({
      ...item,
      publishedLabel: formatPublishedAtLabel(item.publishedAt),
    }))
    return (
      <ProtectedPostPage
        post={safePostWithLabels}
        prevPost={prevPost}
        nextPost={nextPost}
        relatedPosts={relatedPostsWithLabels}
        commentsEnabled={commentsEnabled}
        allowGuest={!!allowGuest}
        ownerName={ownerName}
        ownerRole={ownerRole}
        defaultAvatarUrl={defaultAvatarUrl || ''}
        mobileReadingBackground={mobileReadingBackground}
      />
    )
  }

  const post = { ...basePost, content: basePost.content || '' }
  const relatedPostsWithLabels = relatedPosts.map((item) => ({
    ...item,
    publishedLabel: formatPublishedAtLabel(item.publishedAt),
  }))

  const headings: HeadingItem[] = extractHeadingsFromMarkdown(post.content, 3).map(
    (heading, index) => ({
      id: `heading-${index}`,
      text: heading.text,
      level: heading.level,
    })
  )

  return (
    <div className="min-h-screen">
      <PostTitleSync title={post.title} />
      {/* 文章头部 */}
      <article className="bg-transparent py-12 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {/* 返回按钮 */}
          <Link
            href="/posts"
            className="mb-6 inline-flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回文章列表
          </Link>

          {/* 文章标题 */}
          <h1 className="mb-6 font-serif text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl md:text-5xl dark:text-white">
            {post.title}
          </h1>

          {/* 文章摘要 */}
          {post.excerpt && (
            <p className="mb-8 text-xl text-gray-600 dark:text-gray-400">{post.excerpt}</p>
          )}

          {/* 文章元信息 */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{post.author.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <time>{formatPublishedAtLabel(post.publishedAt)}</time>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>{post.readingTime || 1} 分钟阅读</span>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span>
                <ViewCount slug={slug} initialCount={post.viewCount?.count || 0} /> 次阅读
              </span>
            </div>
            {post.updatedAt &&
              post.publishedAt &&
              new Date(post.updatedAt).getTime() - new Date(post.publishedAt).getTime() > 60000 && (
                <div className="pg-post-updated-meta text-primary flex items-center gap-2 font-medium">
                  <Edit3 className="h-4 w-4" />
                  <span>最后编辑于 {format(new Date(post.updatedAt), 'yyyy-MM-dd HH:mm')}</span>
                </div>
              )}
          </div>

          {/* 分类和标签 */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
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
      <div className="mx-auto mb-6 max-w-6xl px-4 sm:px-6 lg:px-8">
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
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
            {/* 主要内容 */}
            <div className="min-w-0 lg:col-span-3">
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

              {/* MDX内容 */}
              <Card className={`min-w-0 ${contentCardClassName}`}>
                <CardContent className={`min-w-0 ${contentPaddingClassName}`}>
                  <MDXContent content={post.content} />
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
                          <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">上一篇</p>
                          <p className="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
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
                          <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">下一篇</p>
                          <p className="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
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
              {commentsEnabled && (
                <div className="mt-8">
                  <CommentSection
                    postSlug={slug}
                    allowGuest={!!allowGuest}
                    defaultAvatarUrl={defaultAvatarUrl || undefined}
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
                        <AvatarFallback className="bg-gray-50 font-serif text-lg font-bold text-gray-900 dark:bg-gray-800 dark:text-white">
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
                      <RelatedPostsList posts={relatedPostsWithLabels} />
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

// 生成元数据
export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { slug } = await params

  const post = await getPublishedPostBySlug(slug)

  if (!post) {
    return {
      title: '文章未找到',
    }
  }

  return {
    title: post.title,
    description: post.excerpt || post.title,
    alternates: {
      canonical: toCanonicalPath(`/posts/${slug}`),
    },
    openGraph: {
      type: 'article',
      url: toCanonicalPath(`/posts/${slug}`),
      title: post.title,
      description: post.excerpt || post.title,
      images: post.coverImage ? [post.coverImage] : [],
    },
    twitter: {
      card: post.coverImage ? 'summary_large_image' : 'summary',
      title: post.title,
      description: post.excerpt || post.title,
      images: post.coverImage ? [post.coverImage] : [],
    },
  }
}
