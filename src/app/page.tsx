import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Eye } from 'lucide-react'
import { HeroSection } from '@/components/home/hero-section'
import { getPublicSettings, getSetting } from '@/lib/settings'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { RecentCommentsTimeline } from '@/components/comments/recent-comments-timeline'
import { PostMeta } from '@/components/posts/post-meta'

export const revalidate = 60

export default async function HomePage() {
  const [settings, commentsEnabledRaw, latestPosts, categories, tags] = await Promise.all([
    getPublicSettings(),
    getSetting<boolean>('comments.enabled', true),
    prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
      },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        publishedAt: true,
        readingTime: true,
        isProtected: true,
        author: {
          select: {
            name: true,
            image: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        postTags: {
          select: {
            tag: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
          take: 5,
        },
        viewCount: {
          select: {
            count: true,
          },
        },
      },
      orderBy: {
        publishedAt: 'desc',
      },
      take: 6,
    }),
    prisma.category.findMany({
      include: {
        _count: {
          select: {
            posts: {
              where: { status: 'PUBLISHED' },
            },
          },
        },
      },
      take: 8,
    }),
    prisma.tag.findMany({
      include: {
        _count: {
          select: {
            posts: true,
          },
        },
      },
      orderBy: {
        posts: {
          _count: 'desc',
        },
      },
      take: 10,
    }),
  ])
  const commentsEnabled = commentsEnabledRaw ?? true
  const ownerName = typeof settings['site.ownerName'] === 'string' ? settings['site.ownerName'] : '千叶'
  const defaultAvatarUrl = typeof settings['site.defaultAvatarUrl'] === 'string' ? settings['site.defaultAvatarUrl'] : ''
  const ownerRole = typeof settings['profile.role'] === 'string' ? settings['profile.role'] : '全栈开发者'
  const signature = typeof settings['profile.signature'] === 'string' ? settings['profile.signature'] : '热爱技术,喜欢分享。这里记录我的学习和成长过程。'

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <HeroSection settings={settings} />

      {/* 主要内容区 */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* 文章列表 */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                  最新文章
                </h2>
                <Link href="/posts">
                  <Button variant="outline" size="sm" className="pg-public-outline-btn">
                    查看全部
                  </Button>
                </Link>
              </div>

              {latestPosts.length === 0 ? (
                <Card>
                  <CardContent className="flex min-h-[300px] flex-col items-center justify-center p-12 text-center">
                    <p className="text-lg text-gray-500 dark:text-gray-400">
                      暂无文章
                    </p>
                    <Link href="/admin/posts">
                      <Button className="mt-4">
                        写第一篇文章
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6">
                  {latestPosts.map((post) => (
                    <Card
                      key={post.id}
                      className="overflow-hidden hover:shadow-lg transition-shadow"
                    >
                      <Link href={`/posts/${post.slug}`}>
                        <CardHeader className="space-y-2 pb-0">
                          <PostMeta
                            publishedAt={post.publishedAt}
                            authorName={post.author.name}
                            readingTime={post.readingTime}
                            isProtected={post.isProtected}
                          />
                          <CardTitle className="line-clamp-2 text-xl hover:text-blue-600 dark:hover:text-blue-400">
                            {post.title}
                          </CardTitle>
                          {post.excerpt && (
                            <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
                              {post.excerpt}
                            </p>
                          )}
                        </CardHeader>
                      </Link>
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {post.category && (
                              <Badge variant="secondary" className="pg-public-badge-secondary">
                                {post.category.name}
                              </Badge>
                            )}
                            {post.postTags.map((pt) => (
                              <Badge
                                key={pt.tag.id}
                                variant="outline"
                                className="pg-public-badge-outline text-xs"
                              >
                                {pt.tag.name}
                              </Badge>
                            ))}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                            {post.viewCount && (
                              <div className="flex items-center gap-1">
                                <Eye className="h-4 w-4" />
                                <span>{post.viewCount.count}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* 侧边栏 */}
            <div className="space-y-6">
              {/* 个人简介 */}
              <Card>
                <CardHeader>
                  <CardTitle>关于我</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16 border-2 border-gray-900 dark:border-white">
                      <AvatarImage src={defaultAvatarUrl || undefined} />
                      <AvatarFallback className="bg-gray-50 dark:bg-gray-800 text-xl font-serif font-bold text-gray-900 dark:text-white">
                        {(ownerName || '千叶').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {ownerName || '千叶'}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {ownerRole || '全栈开发者'}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {signature || '热爱技术,喜欢分享。这里记录我的学习和成长过程。'}
                  </p>
                </CardContent>
              </Card>

              {/* 分类 */}
              <Card>
                <CardHeader>
                  <CardTitle>分类</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {categories.map((cat) => (
                      <li key={cat.id}>
                        <Link
                          href={`/categories/${cat.slug}`}
                          className="flex items-center justify-between text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white group"
                        >
                          <span>{cat.name}</span>
                          <span className="text-xs text-gray-400 group-hover:text-gray-600">
                            {cat._count.posts}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* 热门标签 */}
              <Card>
                <CardHeader>
                  <CardTitle>热门标签</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <Link
                        key={tag.id}
                        href={`/tags/${tag.slug}`}
                      >
                        <Badge
                          variant="secondary"
                          className="pg-public-badge-secondary"
                        >
                          {tag.name}
                          <span className="ml-1 text-xs opacity-60">
                            ({tag._count.posts})
                          </span>
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* 最新评论 */}
              {commentsEnabled && (
                <Card>
                  <CardHeader>
                    <CardTitle>最新评论</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RecentCommentsTimeline />
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
