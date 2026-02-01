import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, Clock, Eye, Tag as TagIcon, ArrowLeft, Lock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import Link from 'next/link'

export const revalidate = 60

interface TagPageProps {
  params: Promise<{
    slug: string
  }>
  searchParams: Promise<{
    page?: string
  }>
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const { slug } = await params
  const { page: pageParam } = await searchParams
  const page = parseInt(pageParam || '1')
  const pageSize = 12
  const skip = (page - 1) * pageSize

  // 获取标签信息
  const tag = await prisma.tag.findUnique({
    where: { slug },
    include: {
      _count: {
        select: {
          posts: {
            where: {
              post: {
                status: 'PUBLISHED',
              },
            },
          },
        },
      },
    },
  })

  if (!tag) {
    notFound()
  }

  const [posts, totalPosts] = await Promise.all([
    prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
        postTags: {
          some: {
            tagId: tag.id,
          },
        },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        coverImage: true,
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
            name: true,
            slug: true,
          },
        },
        postTags: {
          take: 5,
          select: {
            tag: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
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
      skip,
      take: pageSize,
    }),
    prisma.post.count({
      where: {
        status: 'PUBLISHED',
        postTags: {
          some: {
            tagId: tag.id,
          },
        },
      },
    }),
  ])

  const totalPages = Math.ceil(totalPosts / pageSize)

  return (
    <div className="min-h-screen">
      {/* 页面头部 */}
      <section className="py-12 sm:py-16 bg-transparent">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-6">
            <Link href="/posts">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回文章列表
              </Button>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-serif font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl">
                  #{tag.name}
                </h1>
                <Badge variant="secondary" className="text-lg">
                  {totalPosts} 篇文章
                </Badge>
              </div>
              <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
                标记为 "{tag.name}" 的所有文章
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 主要内容区 */}
      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* 文章数量 */}
          <div className="mb-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              共找到 <span className="font-semibold text-gray-900 dark:text-white">{totalPosts}</span> 篇文章
              {totalPosts > pageSize && ` · 第 ${page} / ${totalPages} 页`}
            </p>
          </div>

          {/* 文章列表 */}
          {posts.length === 0 ? (
            <Card>
              <CardContent className="flex min-h-[300px] flex-col items-center justify-center p-12 text-center">
                <TagIcon className="h-16 w-16 text-gray-400 mb-4" />
                <p className="text-lg text-gray-500 dark:text-gray-400">
                  该标签下暂无文章
                </p>
                <Link href="/posts">
                  <Button className="mt-4" variant="outline">
                    浏览所有文章
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {posts.map((post) => (
                  <Card
                    key={post.id}
                    className="overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    <Link href={`/posts/${post.slug}`}>
                      {post.coverImage && (
                        <div className="aspect-video w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                          <img
                            src={post.coverImage}
                            alt={post.title}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      )}
                      <CardHeader className="space-y-2 pb-0">
                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                          <Calendar className="h-4 w-4" />
                          <time>
                            {post.publishedAt &&
                              formatDistanceToNow(
                                new Date(post.publishedAt),
                                { addSuffix: true, locale: zhCN }
                              )}
                          </time>
                          <span>•</span>
                          <span>{post.author.name}</span>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{post.readingTime || 1} 分钟阅读</span>
                          </div>
                          {post.isProtected && (
                            <>
                              <span>•</span>
                              <div className="flex items-center gap-1">
                                <Lock className="h-3 w-3" />
                                <span>加密</span>
                              </div>
                            </>
                          )}
                        </div>
                        <CardTitle className="line-clamp-2 hover:text-blue-600 dark:hover:text-blue-400">
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
                        <div className="flex items-center gap-2 flex-wrap">
                          {post.category && (
                            <Badge variant="secondary" className="text-xs">
                              {post.category.name}
                            </Badge>
                          )}
                          {post.postTags
                            .filter((pt) => pt.tag.id !== tag.id)
                            .slice(0, 2)
                            .map((pt) => (
                              <Badge
                                key={pt.tag.id}
                                variant="outline"
                                className="text-xs"
                              >
                                {pt.tag.name}
                              </Badge>
                            ))}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                          <Eye className="h-4 w-4" />
                          <span>{post.viewCount?.count || 0}</span>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0">
                      <Link href={`/posts/${post.slug}`} className="w-full">
                        <Button variant="outline" className="w-full" size="sm">
                          阅读全文
                        </Button>
                      </Link>
                    </CardFooter>
                  </Card>
                ))}
              </div>

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  {page > 1 && (
                    <Link
                      href={{
                        pathname: `/tags/${slug}`,
                        query: { page: (page - 1).toString() },
                      }}
                    >
                      <Button variant="outline" size="sm">
                        上一页
                      </Button>
                    </Link>
                  )}

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (page <= 3) {
                        pageNum = i + 1
                      } else if (page >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = page - 2 + i
                      }

                      return (
                        <Link
                          key={pageNum}
                          href={{
                            pathname: `/tags/${slug}`,
                            query: { page: pageNum.toString() },
                          }}
                        >
                          <Button
                            variant={pageNum === page ? 'default' : 'outline'}
                            size="sm"
                            className="w-10"
                          >
                            {pageNum}
                          </Button>
                        </Link>
                      )
                    })}
                  </div>

                  {page < totalPages && (
                    <Link
                      href={{
                        pathname: `/tags/${slug}`,
                        query: { page: (page + 1).toString() },
                      }}
                    >
                      <Button variant="outline" size="sm">
                        下一页
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

// 生成元数据
export async function generateMetadata({ params }: TagPageProps) {
  const { slug } = await params
  const tag = await prisma.tag.findUnique({
    where: { slug },
    select: {
      name: true,
    },
  })

  if (!tag) {
    return {
      title: '标签未找到',
    }
  }

  return {
    title: `#${tag.name} - 文章标签`,
    description: `浏览标记为 "${tag.name}" 的所有文章`,
  }
}
