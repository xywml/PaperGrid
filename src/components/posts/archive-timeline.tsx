'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ArchiveMonthPage, ArchivePostNode, ArchiveYearNode } from '@/types/archive'

interface ArchiveTimelineProps {
  years: ArchiveYearNode[]
}

interface MonthLoadState {
  posts: ArchivePostNode[]
  page: number
  hasMore: boolean
  loaded: boolean
  loading: boolean
  error: string | null
}

const DEFAULT_PAGE_SIZE = 20

function getMonthKey(year: number, month: number): string {
  return `${year}-${month}`
}

function createInitialMonthState(): MonthLoadState {
  return {
    posts: [],
    page: 0,
    hasMore: true,
    loaded: false,
    loading: false,
    error: null,
  }
}

async function requestMonthPosts(
  year: number,
  month: number,
  page: number,
  pageSize: number
): Promise<ArchiveMonthPage> {
  const params = new URLSearchParams({
    year: String(year),
    month: String(month),
    page: String(page),
    pageSize: String(pageSize),
  })

  const response = await fetch(`/api/archive?${params.toString()}`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error || '加载失败，请稍后重试')
  }

  return (await response.json()) as ArchiveMonthPage
}

export function ArchiveTimeline({ years }: ArchiveTimelineProps) {
  const defaultOpenYear = years[0]?.year
  const defaultOpenMonth = years[0]?.months[0]?.month
  const defaultMonthKey =
    defaultOpenYear && defaultOpenMonth ? getMonthKey(defaultOpenYear, defaultOpenMonth) : null

  const [expandedYears, setExpandedYears] = useState<Set<number>>(
    () => new Set(defaultOpenYear ? [defaultOpenYear] : [])
  )
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(
    () => new Set(defaultMonthKey ? [defaultMonthKey] : [])
  )
  const [monthStates, setMonthStates] = useState<Record<string, MonthLoadState>>({})

  const loadingMonthKeysRef = useRef<Set<string>>(new Set())
  const autoLoadedMonthKeyRef = useRef<string | null>(null)

  const allYearKeys = useMemo(() => years.map((year) => year.year), [years])
  const isCollapsedAll = expandedYears.size === 0

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) {
        next.delete(year)
      } else {
        next.add(year)
      }
      return next
    })
  }

  const loadMonthPosts = useCallback(
    async (year: number, month: number, page: number, append: boolean) => {
      const key = getMonthKey(year, month)
      if (loadingMonthKeysRef.current.has(key)) {
        return
      }

      loadingMonthKeysRef.current.add(key)
      setMonthStates((prev) => {
        const existing = prev[key] ?? createInitialMonthState()
        return {
          ...prev,
          [key]: {
            ...existing,
            loading: true,
            error: null,
          },
        }
      })

      try {
        const data = await requestMonthPosts(year, month, page, DEFAULT_PAGE_SIZE)

        setMonthStates((prev) => {
          const existing = prev[key] ?? createInitialMonthState()
          const posts = append ? [...existing.posts, ...data.posts] : data.posts

          return {
            ...prev,
            [key]: {
              posts,
              page: data.page,
              hasMore: data.hasMore,
              loaded: true,
              loading: false,
              error: null,
            },
          }
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : '加载失败，请稍后重试'
        setMonthStates((prev) => {
          const existing = prev[key] ?? createInitialMonthState()
          return {
            ...prev,
            [key]: {
              ...existing,
              loading: false,
              error: message,
            },
          }
        })
      } finally {
        loadingMonthKeysRef.current.delete(key)
      }
    },
    []
  )

  useEffect(() => {
    if (!defaultOpenYear || !defaultOpenMonth) {
      return
    }

    const key = getMonthKey(defaultOpenYear, defaultOpenMonth)
    if (autoLoadedMonthKeyRef.current === key) {
      return
    }

    autoLoadedMonthKeyRef.current = key
    void loadMonthPosts(defaultOpenYear, defaultOpenMonth, 1, false)
  }, [defaultOpenYear, defaultOpenMonth, loadMonthPosts])

  const toggleMonth = (year: number, month: number) => {
    const key = getMonthKey(year, month)
    const willOpen = !expandedMonths.has(key)

    setExpandedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })

    const currentState = monthStates[key]
    if (willOpen && !currentState?.loaded && !currentState?.loading) {
      void loadMonthPosts(year, month, 1, false)
    }
  }

  return (
    <div className="pg-archive-timeline grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
        <div className="pg-archive-nav-panel rounded-lg border border-gray-200 bg-white/80 p-4 dark:border-gray-700 dark:bg-gray-900/60">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">年份导航</p>
          <div className="mt-3 flex max-h-64 flex-wrap gap-2 overflow-y-auto lg:block lg:gap-0 lg:space-y-1">
            {years.map((year) => (
              <a
                key={year.year}
                href={`#archive-year-${year.year}`}
                className="pg-archive-year-link inline-flex items-center rounded-md px-2 py-1 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
              >
                {year.year} 年
              </a>
            ))}
          </div>
        </div>

        <div className="pg-archive-toggle-panel relative overflow-hidden rounded-lg border border-gray-200 bg-gray-100/80 p-1 dark:border-gray-700 dark:bg-gray-800/70">
          <span
            className={cn(
              'pg-archive-toggle-indicator pointer-events-none absolute top-1 left-1 h-[calc(100%-0.5rem)] w-[calc(50%-0.25rem)] rounded-md bg-primary shadow-sm transition-transform duration-200',
              isCollapsedAll ? 'translate-x-full' : 'translate-x-0'
            )}
            aria-hidden
          />

          <div className="relative grid grid-cols-2">
            <button
              type="button"
              aria-pressed={!isCollapsedAll}
              onClick={() => {
                setExpandedYears(new Set(allYearKeys))
              }}
              className={cn(
                'pg-archive-toggle-btn relative z-10 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                !isCollapsedAll
                  ? 'text-primary-foreground'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
              )}
            >
              展开年份
            </button>
            <button
              type="button"
              aria-pressed={isCollapsedAll}
              onClick={() => {
                setExpandedYears(new Set())
                setExpandedMonths(new Set())
              }}
              className={cn(
                'pg-archive-toggle-btn relative z-10 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                isCollapsedAll
                  ? 'text-primary-foreground'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
              )}
            >
              全部折叠
            </button>
          </div>
        </div>
      </aside>

      <div className="relative pl-5 sm:pl-7">
        <div className="pg-archive-rail absolute top-0 left-1.5 h-full w-px bg-gray-200 dark:bg-gray-700" />

        <div className="space-y-8">
          {years.map((year) => {
            const isYearOpen = expandedYears.has(year.year)
            return (
              <section
                key={year.year}
                id={`archive-year-${year.year}`}
                className="relative scroll-mt-24"
              >
                <span className="pg-archive-year-dot border-primary absolute top-3 -left-5 h-3 w-3 rounded-full border-2 bg-white dark:bg-gray-900" />

                <button
                  type="button"
                  onClick={() => toggleYear(year.year)}
                  className="pg-archive-year-btn flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white/70 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900/60 dark:hover:bg-gray-800"
                >
                  <span className="flex items-center gap-2">
                    {isYearOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="pg-archive-year-title text-lg font-bold text-gray-900 dark:text-white">
                      {year.year} 年
                    </span>
                  </span>
                  <Badge variant="secondary">{year.postCount} 篇</Badge>
                </button>

                {isYearOpen && (
                  <div className="mt-4 space-y-5 pl-3 sm:pl-5">
                    {year.months.map((month) => {
                      const monthKey = getMonthKey(year.year, month.month)
                      const isMonthOpen = expandedMonths.has(monthKey)
                      const monthState = monthStates[monthKey] ?? createInitialMonthState()

                      return (
                        <div
                          key={monthKey}
                          id={`archive-${monthKey}`}
                          className="relative scroll-mt-24"
                        >
                          <span className="pg-archive-month-dot bg-primary/70 absolute top-3 -left-4 h-2.5 w-2.5 rounded-full" />

                          <button
                            type="button"
                            onClick={() => toggleMonth(year.year, month.month)}
                            className="pg-archive-month-btn flex w-full items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
                          >
                            <span className="pg-archive-month-label flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                              {isMonthOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              <CalendarDays className="h-4 w-4" />
                              {month.month} 月
                            </span>
                            <Badge variant="outline">{month.postCount}</Badge>
                          </button>

                          {isMonthOpen && (
                            <div className="mt-3 pl-3 sm:pl-5" aria-busy={monthState.loading}>
                              {monthState.loading && !monthState.loaded && (
                                <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  正在加载本月文章...
                                </p>
                              )}

                              {monthState.error && !monthState.loaded && (
                                <div className="space-y-2">
                                  <p className="text-sm text-red-500 dark:text-red-400">{monthState.error}</p>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void loadMonthPosts(year.year, month.month, 1, false)}
                                  >
                                    重试
                                  </Button>
                                </div>
                              )}

                              {monthState.loaded && monthState.posts.length === 0 && (
                                <p className="text-sm text-gray-500 dark:text-gray-400">本月暂无文章</p>
                              )}

                              {monthState.posts.length > 0 && (
                                <ul className="space-y-2">
                                  {monthState.posts.map((post) => (
                                    <li key={post.id} className="relative">
                                      <span className="pg-archive-post-dot absolute top-2 -left-4 h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500" />
                                      <Link
                                        href={`/posts/${post.slug}`}
                                        className={cn(
                                          'pg-archive-post-link block rounded-md border border-transparent px-2 py-2 transition-colors',
                                          'hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-800'
                                        )}
                                      >
                                        <p className="pg-archive-post-title text-sm font-medium text-gray-800 dark:text-gray-100">
                                          {post.title}
                                        </p>
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              )}

                              {monthState.error && monthState.loaded && (
                                <p className="mt-2 text-xs text-red-500 dark:text-red-400">
                                  {monthState.error}
                                </p>
                              )}

                              {monthState.loaded && monthState.hasMore && (
                                <div className="mt-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={monthState.loading}
                                    onClick={() =>
                                      void loadMonthPosts(
                                        year.year,
                                        month.month,
                                        monthState.page + 1,
                                        true
                                      )
                                    }
                                  >
                                    {monthState.loading ? (
                                      <span className="flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        加载中...
                                      </span>
                                    ) : (
                                      '加载更多'
                                    )}
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
