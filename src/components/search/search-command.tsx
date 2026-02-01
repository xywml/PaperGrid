'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, File, Folder, Tag as TagIcon, X, Lock } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface SearchResult {
  type: 'post' | 'category' | 'tag'
  title?: string
  name?: string
  slug: string
  excerpt?: string
  url: string
  postCount?: number
  tags?: string[]
  category?: string
  description?: string
  isProtected?: boolean
}

interface SearchResults {
  posts: Array<SearchResult & { author?: string; publishedAt?: string }>
  categories: SearchResult[]
  tags: SearchResult[]
  stats: {
    total: number
    postsCount: number
    categoriesCount: number
    tagsCount: number
  }
}

interface SearchCommandProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SearchCommand({ open, onOpenChange }: SearchCommandProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<SearchResults | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [activeTab, setActiveTab] = useState<'all' | 'posts' | 'categories' | 'tags'>('all')

  // 获取所有可搜索的选项
  const allItems = useCallback(() => {
    if (!results || !results.posts || !results.categories || !results.tags) return []

    const items: Array<{ item: SearchResult; type: string }> = []

    if (activeTab === 'all' || activeTab === 'posts') {
      results.posts.forEach((post) => {
        items.push({ item: post, type: 'post' })
      })
    }

    if (activeTab === 'all' || activeTab === 'categories') {
      results.categories.forEach((cat) => {
        items.push({ item: cat, type: 'category' })
      })
    }

    if (activeTab === 'all' || activeTab === 'tags') {
      results.tags.forEach((tag) => {
        items.push({ item: tag, type: 'tag' })
      })
    }

    return items
  }, [results, activeTab])

  // 搜索功能
  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setResults(null)
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await response.json()
      // 合并 results 和 stats
      setResults({ ...data.results, stats: data.stats })
      setSelectedIndex(0)
    } catch (error) {
      console.error('搜索失败:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 防抖搜索
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      search(query)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [query, search])

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return

      // ESC 关闭
      if (e.key === 'Escape') {
        onOpenChange(false)
        return
      }

      // 下移
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const items = allItems()
        setSelectedIndex((prev) => (prev + 1) % items.length)
      }

      // 上移
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const items = allItems()
        setSelectedIndex((prev) => (prev - 1 + items.length) % items.length)
      }

      // 回车选择
      if (e.key === 'Enter') {
        e.preventDefault()
        const items = allItems()
        const selected = items[selectedIndex]
        if (selected) {
          router.push(selected.item.url)
          onOpenChange(false)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, selectedIndex, allItems, router, onOpenChange])

  // 选择结果
  const handleSelect = (url: string) => {
    router.push(url)
    onOpenChange(false)
  }

  const items = allItems()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg max-w-2xl">
        <DialogTitle className="sr-only">搜索</DialogTitle>
        <div className="flex flex-col">
          {/* 搜索输入框 */}
          <div className="flex items-center border-b px-4 py-3">
            <Search className="mr-2 h-5 w-5 shrink-0 opacity-50" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索文章、分类、标签..."
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              autoFocus
            />
            <button
              onClick={() => {
                setQuery('')
                setResults(null)
              }}
              className="ml-2 shrink-0 rounded-sm opacity-50 hover:opacity-100 transition-opacity"
            >
              <X className="h-5 w-5" />
            </button>
            <kbd className="ml-2 hidden h-5 shrink-0 select-none items-center gap-1 rounded border bg-muted px-2 text-[10px] font-medium opacity-50 sm:flex sm:text-xs">
              <span className="text-xs">ESC</span>
            </kbd>
          </div>

          {/* 标签切换 */}
          {results && results.stats.total > 0 && (
            <div className="flex gap-2 border-b px-4 py-2">
              <button
                onClick={() => setActiveTab('all')}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  activeTab === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                全部 ({results.stats.total})
              </button>
              <button
                onClick={() => setActiveTab('posts')}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  activeTab === 'posts'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                文章 ({results.stats.postsCount})
              </button>
              <button
                onClick={() => setActiveTab('categories')}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  activeTab === 'categories'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                分类 ({results.stats.categoriesCount})
              </button>
              <button
                onClick={() => setActiveTab('tags')}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  activeTab === 'tags'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                标签 ({results.stats.tagsCount})
              </button>
            </div>
          )}

          {/* 搜索结果 */}
          <ScrollArea className="max-h-[400px]">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                  <p className="mt-4 text-sm text-muted-foreground">搜索中...</p>
                </div>
              </div>
            )}

            {!isLoading && query && query.trim().length >= 2 && !results && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">没有找到结果</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  尝试使用不同的关键词搜索
                </p>
              </div>
            )}

            {!isLoading && !query && (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Search className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">开始搜索</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  输入关键词搜索文章、分类或标签
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  <Badge variant="secondary" className="cursor-pointer hover:bg-accent" onClick={() => setQuery('Next.js')}>
                    Next.js
                  </Badge>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-accent" onClick={() => setQuery('TypeScript')}>
                    TypeScript
                  </Badge>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-accent" onClick={() => setQuery('Prisma')}>
                    Prisma
                  </Badge>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-accent" onClick={() => setQuery('React')}>
                    React
                  </Badge>
                </div>
              </div>
            )}

            {!isLoading && results && items.length > 0 && (
              <div className="py-2">
                {items.map(({ item, type }, index) => (
                  <button
                    key={`${type}-${item.slug}-${index}`}
                    onClick={() => handleSelect(item.url)}
                    className={cn(
                      'flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-accent transition-colors',
                      selectedIndex === index && 'bg-accent'
                    )}
                  >
                    {/* 图标 */}
                    <div className="shrink-0">
                      {type === 'post' && <File className="h-5 w-5 text-blue-500" />}
                      {type === 'category' && <Folder className="h-5 w-5 text-green-500" />}
                      {type === 'tag' && <TagIcon className="h-5 w-5 text-orange-500" />}
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      {type === 'post' && (
                        <>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {item.title}
                          </p>
                          {item.excerpt && (
                            <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                              {item.excerpt}
                            </p>
                          )}
                          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                            {item.category && (
                              <Badge variant="outline" className="text-xs">
                                {item.category}
                              </Badge>
                            )}
                            {item.isProtected && (
                              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                <Lock className="h-3 w-3" />
                                加密
                              </Badge>
                            )}
                            {item.tags && item.tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </>
                      )}

                      {type === 'category' && (
                        <>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {item.name}
                          </p>
                          {item.description && (
                            <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                              {item.description}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-gray-500">
                            {item.postCount} 篇文章
                          </p>
                        </>
                      )}

                      {type === 'tag' && (
                        <>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {item.name}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {item.postCount} 篇文章
                          </p>
                        </>
                      )}
                    </div>

                    {/* 类型标签 */}
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {type === 'post' && '文章'}
                      {type === 'category' && '分类'}
                      {type === 'tag' && '标签'}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* 底部提示 */}
          <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <kbd className="h-5 rounded border bg-muted px-1.5 text-[10px]">↑↓</kbd>
                <span>导航</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="h-5 rounded border bg-muted px-1.5 text-[10px]">↵</kbd>
                <span>选择</span>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1">
              <kbd className="h-5 rounded border bg-muted px-1.5 text-[10px]">Ctrl</kbd>
              <span>+</span>
              <kbd className="h-5 rounded border bg-muted px-1.5 text-[10px]">K</kbd>
              <span>打开</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
