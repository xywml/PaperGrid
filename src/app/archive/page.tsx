import { Card, CardContent } from '@/components/ui/card'
import { CalendarDays } from 'lucide-react'
import { ArchiveTimeline } from '@/components/posts/archive-timeline'
import { getArchiveTimeline } from '@/lib/archive'
import { SectionHeadingAccent } from '@/components/layout/section-heading-accent'

export const revalidate = 60

export default async function ArchivePage() {
  const { years, totalPosts } = await getArchiveTimeline()

  return (
    <div className="pg-archive-page min-h-screen">
      <section className="bg-transparent py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="pg-archive-title mb-4 font-serif text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl dark:text-white">
              归档
            </h1>
            <SectionHeadingAccent />
            <p className="pg-archive-subtitle mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
              按发布时间回顾全部文章，支持按年份与月份快速定位
            </p>
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="pg-archive-stats mb-6 flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
            <span>
              共{' '}
              <strong className="pg-archive-emphasis font-semibold text-gray-900 dark:text-white">{totalPosts}</strong>{' '}
              篇文章
            </span>
            <span className="pg-archive-divider h-1 w-1 rounded-full bg-gray-400" />
            <span>
              覆盖{' '}
              <strong className="pg-archive-emphasis font-semibold text-gray-900 dark:text-white">
                {years.length}
              </strong>{' '}
              个年份
            </span>
          </div>

          {totalPosts === 0 ? (
            <Card>
              <CardContent className="flex min-h-[280px] flex-col items-center justify-center p-12 text-center">
                <CalendarDays className="mb-4 h-14 w-14 text-gray-400" />
                <p className="text-lg text-gray-500 dark:text-gray-400">暂无可归档文章</p>
              </CardContent>
            </Card>
          ) : (
            <ArchiveTimeline years={years} />
          )}
        </div>
      </section>
    </div>
  )
}
