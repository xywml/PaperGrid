import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GitCommitVertical } from 'lucide-react'
import { CHANGELOG } from '@/lib/changelog'

export default function AdminChangelogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">更新记录</h1>
        <p className="text-muted-foreground">精简版本时间线，快速查看最近迭代。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>版本时间线</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-6">
            {CHANGELOG.map((item, index) => (
              <li key={item.version} className="relative pl-10">
                {index !== CHANGELOG.length - 1 && (
                  <span className="absolute left-4 top-8 h-[calc(100%+0.5rem)] w-px bg-border" aria-hidden />
                )}

                <span className="absolute left-1.5 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background">
                  <GitCommitVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{item.version}</Badge>
                  <span className="text-sm text-muted-foreground">{item.date}</span>
                </div>

                <ul className="mt-2 space-y-1 text-sm text-foreground/90">
                  {item.highlights.map((line) => (
                    <li key={line}>- {line}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
