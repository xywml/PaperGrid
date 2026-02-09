'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'

interface CategoryOption {
  id: string
  name: string
}

interface PostsFiltersProps {
  categories: CategoryOption[]
  initialQuery: string
  initialStatus: string
  initialCategoryId: string
  onChange?: (filters: { query: string; status: string; categoryId: string }) => void
  loading?: boolean
}

export function PostsFilters({
  categories,
  initialQuery,
  initialStatus,
  initialCategoryId,
  onChange,
  loading,
}: PostsFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(initialQuery)
  const [status, setStatus] = useState(initialStatus)
  const [categoryId, setCategoryId] = useState(initialCategoryId)
  const mountedRef = useRef(false)

  useEffect(() => {
    setQuery(initialQuery)
    setStatus(initialStatus)
    setCategoryId(initialCategoryId)
  }, [initialQuery, initialStatus, initialCategoryId])

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    const timeout = setTimeout(() => {
      if (onChange) {
        onChange({ query, status, categoryId })
        return
      }

      const currentParams = searchParams?.toString() || ''
      const params = new URLSearchParams(currentParams)

      if (query) params.set('q', query)
      else params.delete('q')

      if (status) params.set('status', status)
      else params.delete('status')

      if (categoryId) params.set('categoryId', categoryId)
      else params.delete('categoryId')

      const nextParams = params.toString()
      if (nextParams === currentParams) return

      router.replace(nextParams ? `${pathname}?${nextParams}` : pathname)
    }, 300)

    return () => clearTimeout(timeout)
  }, [query, status, categoryId, pathname, router, searchParams, onChange])

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative w-full flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          placeholder="搜索文章..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 transition-shadow"
        />
      </div>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 transition-shadow sm:w-[180px]"
      >
        <option value="">所有状态</option>
        <option value="DRAFT">草稿</option>
        <option value="PUBLISHED">公开</option>
        <option value="ARCHIVED">隐藏</option>
      </select>
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 transition-shadow sm:w-[200px]"
      >
        <option value="">所有分类</option>
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.name}
          </option>
        ))}
      </select>
    </div>
  )
}
