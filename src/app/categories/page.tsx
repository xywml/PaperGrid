import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FolderOpen } from 'lucide-react'
import Link from 'next/link'
import { SectionHeadingAccent } from '@/components/layout/section-heading-accent'

export const revalidate = 60

export default async function CategoriesPage() {
  const [categories, totalPosts] = await Promise.all([
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
    prisma.post.count({
      where: {
        status: 'PUBLISHED',
      },
    }),
  ])

  return (
    <div className="min-h-screen">
      {/* 页面头部 */}
      <section className="py-12 sm:py-16 bg-transparent">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-serif font-bold tracking-tight text-gray-900 dark:text-white sm:text-6xl mb-4">
              文章分类
            </h1>
            <SectionHeadingAccent />
            <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-600 dark:text-gray-400">
              浏览所有文章分类,找到你感兴趣的内容
            </p>
          </div>
        </div>
      </section>

      {/* 主要内容区 */}
      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              共 <span className="pg-public-stat-emphasis font-semibold text-gray-900 dark:text-white">{categories.length}</span> 个分类,
              <span className="pg-public-stat-emphasis font-semibold text-gray-900 dark:text-white">{totalPosts}</span> 篇文章
            </p>
          </div>

          {categories.length === 0 ? (
            <Card>
              <CardContent className="flex min-h-[300px] flex-col items-center justify-center p-12 text-center">
                <FolderOpen className="h-16 w-16 text-gray-400 mb-4" />
                <p className="text-lg text-gray-500 dark:text-gray-400">
                  暂无分类
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <Link key={category.id} href={`/categories/${category.slug}`}>
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-xl hover:text-blue-600 dark:hover:text-blue-400">
                            {category.name}
                          </CardTitle>
                          {category.description && (
                            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                              {category.description}
                            </p>
                          )}
                        </div>
                        <Badge variant="secondary" className="pg-public-badge-secondary ml-2">
                          {category._count.posts}
                        </Badge>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
