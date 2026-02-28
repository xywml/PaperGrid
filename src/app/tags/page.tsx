import { prisma } from '@/lib/prisma'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tag as TagIcon } from 'lucide-react'
import Link from 'next/link'
import { SectionHeadingAccent } from '@/components/layout/section-heading-accent'

export const revalidate = 60

export default async function TagsPage() {
  const [tags, totalPosts] = await Promise.all([
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
        name: 'asc',
      },
    }),
    prisma.post.count({
      where: {
        status: 'PUBLISHED',
      },
    }),
  ])

  // 按文章数量排序标签
  const sortedTags = [...tags].sort((a, b) => b._count.posts - a._count.posts)

  return (
    <div className="min-h-screen">
      {/* 页面头部 */}
      <section className="py-12 sm:py-16 bg-transparent">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-serif font-bold tracking-tight text-gray-900 dark:text-white sm:text-6xl mb-4">
              文章标签
            </h1>
            <SectionHeadingAccent />
            <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-600 dark:text-gray-400">
              浏览所有标签,探索你感兴趣的话题
            </p>
          </div>
        </div>
      </section>

      {/* 主要内容区 */}
      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              共 <span className="pg-public-stat-emphasis font-semibold text-gray-900 dark:text-white">{tags.length}</span> 个标签,
              <span className="pg-public-stat-emphasis font-semibold text-gray-900 dark:text-white">{totalPosts}</span> 篇文章
            </p>
          </div>

          {tags.length === 0 ? (
            <Card>
              <CardContent className="flex min-h-[300px] flex-col items-center justify-center p-12 text-center">
                <TagIcon className="h-16 w-16 text-gray-400 mb-4" />
                <p className="text-lg text-gray-500 dark:text-gray-400">
                  暂无标签
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8">
                <div className="flex flex-wrap gap-3">
                  {sortedTags.map((tag) => (
                    <Link key={tag.id} href={`/tags/${tag.slug}`}>
                      <Badge
                        variant="secondary"
                        className="pg-public-badge-secondary cursor-pointer px-4 py-2 text-sm transition-colors"
                      >
                        #{tag.name}
                        <span className="ml-2 text-xs opacity-60">
                          ({tag._count.posts})
                        </span>
                      </Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  )
}
