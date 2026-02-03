import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export const revalidate = 60

export default async function YajiPage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-serif font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl mb-4">
            雅集
          </h1>
          <div className="mx-auto h-1 w-12 bg-gray-900 dark:bg-white mb-6 opacity-20" />
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
            精选项目与作品，记录创作之路
          </p>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-500 dark:text-gray-400">
              暂无作品，稍后再来看看吧。
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const fallback = project.name?.charAt(0).toUpperCase() || '作'
              return (
                <Link
                  key={project.id}
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  <Card className="h-full border-gray-200 dark:border-gray-800 hover:shadow-lg transition-shadow">
                    <div className="aspect-[4/3] w-full overflow-hidden rounded-t-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      {project.image ? (
                        <img
                          src={project.image}
                          alt={project.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="text-5xl font-serif font-bold text-gray-900 dark:text-white">
                          {fallback}
                        </span>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
                          {project.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
