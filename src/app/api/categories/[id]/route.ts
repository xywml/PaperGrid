import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { revalidatePublicTaxonomyPaths } from '@/lib/post-revalidate'

// PATCH /api/categories/[id] - 更新分类
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const { name, slug, description } = body

    // 检查分类是否存在
    const existingCategory = await prisma.category.findUnique({
      where: { id },
    })

    if (!existingCategory) {
      return NextResponse.json({ error: '分类不存在' }, { status: 404 })
    }

    // 如果修改了 slug,检查新 slug 是否已存在
    if (slug && slug !== existingCategory.slug) {
      const slugExists = await prisma.category.findUnique({
        where: { slug },
      })

      if (slugExists) {
        return NextResponse.json(
          { error: '分类 slug 已存在' },
          { status: 400 }
        )
      }
    }

    // 更新分类
    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
        ...(description !== undefined && { description }),
      },
    })

    revalidatePublicTaxonomyPaths({
      categorySlugs: [existingCategory.slug, category.slug],
    })

    return NextResponse.json({ category })
  } catch (error) {
    console.error('更新分类失败:', error)
    return NextResponse.json({ error: '更新分类失败' }, { status: 500 })
  }
}

// DELETE /api/categories/[id] - 删除分类
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: '无权操作' }, { status: 403 })
    }

    const { id } = await params

    // 检查分类是否存在
    const existingCategory = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            posts: true,
          },
        },
      },
    })

    if (!existingCategory) {
      return NextResponse.json({ error: '分类不存在' }, { status: 404 })
    }

    // 检查是否有关联的文章
    if (existingCategory._count.posts > 0) {
      return NextResponse.json(
        { error: '该分类下还有文章,无法删除' },
        { status: 400 }
      )
    }

    // 删除分类
    await prisma.category.delete({
      where: { id },
    })

    revalidatePublicTaxonomyPaths({
      categorySlugs: [existingCategory.slug],
    })

    return NextResponse.json({ message: '删除成功' })
  } catch (error) {
    console.error('删除分类失败:', error)
    return NextResponse.json({ error: '删除分类失败' }, { status: 500 })
  }
}
