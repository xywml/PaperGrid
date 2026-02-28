'use client'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

interface PostFiltersProps {
  categories: Array<{ slug: string; name: string; _count: { posts: number } }>
  tags: Array<{ slug: string; name: string; _count: { posts: number } }>
}

export function PostFilters({ categories, tags }: PostFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [category, setCategory] = useState(searchParams.get('category') || 'all')
  const [tag, setTag] = useState(searchParams.get('tag') || 'all')

  const handleFilter = () => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (category && category !== 'all') params.set('category', category)
    if (tag && tag !== 'all') params.set('tag', tag)
    router.push(`/posts?${params.toString()}`)
  }

  const handleClear = () => {
    setSearch('')
    setCategory('all')
    setTag('all')
    router.push('/posts')
  }

  return (
    <div className="pg-post-filters space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Input
            type="search"
            placeholder="搜索文章..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
          />
        </div>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="pg-post-filter-select-trigger w-full sm:w-[180px]">
            <SelectValue placeholder="选择分类" />
          </SelectTrigger>
          <SelectContent className="pg-post-filter-select-content">
            <SelectItem className="pg-post-filter-select-item" value="all">全部分类</SelectItem>
            {categories.map((cat) => (
              <SelectItem className="pg-post-filter-select-item" key={cat.slug} value={cat.slug}>
                {cat.name} ({cat._count.posts})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tag} onValueChange={setTag}>
          <SelectTrigger className="pg-post-filter-select-trigger w-full sm:w-[180px]">
            <SelectValue placeholder="选择标签" />
          </SelectTrigger>
          <SelectContent className="pg-post-filter-select-content">
            <SelectItem className="pg-post-filter-select-item" value="all">全部标签</SelectItem>
            {tags.map((tag) => (
              <SelectItem className="pg-post-filter-select-item" key={tag.slug} value={tag.slug}>
                {tag.name} ({tag._count.posts})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={handleFilter}>筛选</Button>
      </div>

      {(category !== 'all' || tag !== 'all' || search) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-600 dark:text-gray-400">当前筛选:</span>
          {category !== 'all' && (
            <span className="text-sm">
              分类: <strong>{categories.find((c) => c.slug === category)?.name}</strong>
            </span>
          )}
          {tag !== 'all' && (
            <span className="text-sm">
              标签: <strong>{tags.find((t) => t.slug === tag)?.name}</strong>
            </span>
          )}
          {search && (
            <span className="text-sm">
              搜索: <strong>{search}</strong>
            </span>
          )}
          <Button variant="link" className="h-auto p-0 text-blue-600" onClick={handleClear}>
            清除筛选
          </Button>
        </div>
      )}
    </div>
  )
}
