import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AdminPostsClient } from '@/components/admin/posts-client'

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; categoryId?: string }>
}) {
  const session = await auth()

  if (!session?.user) {
    redirect('/auth/signin')
  }

  const params = await searchParams
  const q = params.q?.trim() || ''
  const status = params.status || ''
  const categoryId = params.categoryId || ''

  const where: any = {}
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { excerpt: { contains: q } },
      { content: { contains: q } },
    ]
  }
  if (status && ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
    where.status = status
  }
  if (categoryId) {
    where.categoryId = categoryId
  }

  // 获取文章列表
  const posts = await prisma.post.findMany({
    where,
    select: {
      id: true,
      title: true,
      excerpt: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      author: {
        select: {
          name: true,
          email: true,
        },
      },
      category: {
        select: {
          name: true,
        },
      },
      _count: {
        select: {
          comments: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 20,
  })

  // 获取分类列表
  const categories = await prisma.category.findMany()

  return (
    <AdminPostsClient
      initialPosts={posts}
      categories={categories}
      initialQuery={q}
      initialStatus={status}
      initialCategoryId={categoryId}
    />
  )
}
