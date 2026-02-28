import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, Lock } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { PostFilters } from '@/components/posts/post-filters'
import { getSetting } from '@/lib/settings'
import { Suspense } from 'react'
import { PostMeta } from '@/components/posts/post-meta'
import { SectionHeadingAccent } from '@/components/layout/section-heading-accent'
import { isInternalImageUrl } from '@/lib/image-url'

export const revalidate = 60

interface PostsPageProps {
  searchParams: Promise<{
    page?: string
    search?: string
    category?: string
    tag?: string
  }>
}

export default async function PostsPage({ searchParams }: PostsPageProps) {
  const params = await searchParams
  const page = parseInt(params.page || '1')
  const pageSize = (await getSetting<number>('posts.perPage', 12)) ?? 12
  const skip = (page - 1) * pageSize

  // 获取筛选参数
  const search = params.search || ''
  const categorySlug = params.category || ''
  const tagSlug = params.tag || ''

  // 构建查询条件
  const where: Prisma.PostWhereInput = {
    status: 'PUBLISHED',
  }

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { excerpt: { contains: search } },
      { content: { contains: search } },
    ]
  }

  if (categorySlug) {
    where.category = {
      slug: categorySlug,
    }
  }

  if (tagSlug) {
    where.postTags = {
      some: {
        tag: {
          slug: tagSlug,
        },
      },
    }
  }

  const [totalPosts, posts, categories, tags] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
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
    prisma.category.findMany({
      include: {
        _count: {
          select: {
            posts: {
              where: {
                status: 'PUBLISHED',
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    }),
    prisma.tag.findMany({
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
      orderBy: {
        posts: {
          _count: 'desc',
        },
      },
      take: 20,
    }),
  ])

  // 计算总页数
  const totalPages = Math.ceil(totalPosts / pageSize)

  return (
    <div className="min-h-screen">
      {/* 页面头部 */}
      <section className="py-12 sm:py-16 bg-transparent">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-serif font-bold tracking-tight text-gray-900 dark:text-white sm:text-6xl mb-4">
              文章列表
            </h1>
            <SectionHeadingAccent />
            <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-600 dark:text-gray-400">
              浏览所有已发布的技术文章、生活记录和作品展示
            </p>
          </div>
        </div>
      </section>

      {/* 主要内容区 */}
      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
            {/* 文章列表 */}
            <div className="lg:col-span-3">
              {/* 搜索和筛选栏 */}
              <div className="mb-6">
                <Suspense fallback={<div className="h-10 animate-pulse bg-gray-100 dark:bg-gray-800 rounded-md" />}>
                  <PostFilters categories={categories} tags={tags} />
                </Suspense>
              </div>

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
                    <p className="text-lg text-gray-500 dark:text-gray-400">
                      没有找到相关文章
                    </p>
                    <Link href="/posts">
                      <Button className="mt-4" variant="outline">
                        清除筛选条件
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2">
                  {posts.map((post) => (
                    <Card
                      key={post.id}
                      className="overflow-hidden hover:shadow-lg transition-shadow"
                    >
                      <Link href={`/posts/${post.slug}`}>
                        {post.coverImage && (
                          <div className="relative aspect-video w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                            {isInternalImageUrl(post.coverImage) ? (
                              <Image
                                src={post.coverImage}
                                alt={post.title}
                                fill
                                sizes="(min-width: 1024px) 37vw, (min-width: 640px) 50vw, 100vw"
                                className="object-cover"
                              />
                            ) : (
                              <img
                                src={post.coverImage}
                                alt={post.title}
                                className="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            )}
                          </div>
                        )}
                        <CardHeader className="space-y-2 pb-0">
                          <PostMeta
                            publishedAt={post.publishedAt}
                            authorName={post.author.name}
                            readingTime={post.readingTime}
                            isProtected={post.isProtected}
                          />
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
                              <Badge variant="secondary" className="pg-public-badge-secondary text-xs">
                                {post.category.name}
                              </Badge>
                            )}
                            {post.postTags.slice(0, 3).map((pt) => (
                              <Badge
                                key={pt.tag.id}
                                variant="outline"
                                className="pg-public-badge-outline text-xs"
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
                          <Button variant="outline" className="pg-public-outline-btn w-full">
                            阅读全文
                          </Button>
                        </Link>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  {/* 上一页 */}
                  {page > 1 && (
                    <Link
                      href={{
                        pathname: '/posts',
                        query: {
                          ...params,
                          page: (page - 1).toString(),
                        },
                      }}
                    >
                      <Button variant="outline" size="sm">
                        上一页
                      </Button>
                    </Link>
                  )}

                  {/* 页码 */}
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
                            pathname: '/posts',
                            query: {
                              ...params,
                              page: pageNum.toString(),
                            },
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

                  {/* 下一页 */}
                  {page < totalPages && (
                    <Link
                      href={{
                        pathname: '/posts',
                        query: {
                          ...params,
                          page: (page + 1).toString(),
                        },
                      }}
                    >
                      <Button variant="outline" size="sm">
                        下一页
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* 侧边栏 */}
            <div className="space-y-6">
              {/* 热门文章 */}
              <Card>
                <CardHeader>
                  <CardTitle>热门文章</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {posts.slice(0, 5).map((post, index) => (
                      <li key={post.id}>
                        <Link
                          href={`/posts/${post.slug}`}
                          className="group flex items-start gap-3"
                        >
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                            {index + 1}
                          </span>
                          <div className="flex-1">
                            <p className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                              {post.title}
                            </p>
                            {post.isProtected && (
                              <p className="pg-lock-inline mt-1 text-xs text-gray-500 dark:text-gray-400">
                                <Lock className="mr-1 inline h-3 w-3" />
                                加密文章
                              </p>
                            )}
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              <Eye className="mr-1 inline h-3 w-3" />
                              {post.viewCount?.count || 0} 次阅读
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
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
                          href={`/posts?category=${cat.slug}`}
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
                        href={`/posts?tag=${tag.slug}`}
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
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
