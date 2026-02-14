'use client'

import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Upload } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'

type Counter = {
  created: number
  updated: number
  skipped: number
}

type BackupPreview = {
  format: string
  version: string
  categories: number
  tags: number
  projects: number
  posts: number
  settings: number
}

type TaskType =
  | 'backup_export'
  | 'backup_import'
  | 'migration_export'
  | 'migration_import'

type TaskStatus = 'pending' | 'running' | 'succeeded' | 'failed'

type PublicTaskRecord = {
  id: string
  type: TaskType
  status: TaskStatus
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  options: {
    includeSensitive?: boolean
    source?: 'auto' | 'hexo' | 'hugo'
  }
  inputFileName: string | null
  outputFileName: string | null
  result: unknown
  error: string | null
  downloadUrl: string | null
}

type BackupSummary = {
  categories: Counter
  tags: Counter
  projects: Counter
  posts: Counter
  settings: Counter
  autoCreatedFromPosts: {
    categories: number
    tags: number
  }
  warnings: string[]
  warningOverflow: number
}

type MigrationSummary = {
  posts: Counter
  categories: Counter
  tags: Counter
  warnings: string[]
  warningOverflow: number
  source: 'auto' | 'hexo' | 'hugo'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toNumber(value: unknown): number {
  if (typeof value !== 'number') return 0
  return Number.isFinite(value) ? value : 0
}

function extractBackupPreview(payload: unknown): BackupPreview {
  const root = isRecord(payload) ? payload : {}
  const meta = isRecord(root.meta) ? root.meta : {}
  const dataNode = isRecord(root.data) ? root.data : root
  const countsNode = isRecord(root.counts) ? root.counts : {}

  const categoriesByCount = toNumber(countsNode.categories)
  const tagsByCount = toNumber(countsNode.tags)
  const projectsByCount = toNumber(countsNode.projects)
  const postsByCount = toNumber(countsNode.posts)
  const settingsByCount = toNumber(countsNode.settings)

  const categoriesByArray = Array.isArray(dataNode.categories) ? dataNode.categories.length : 0
  const tagsByArray = Array.isArray(dataNode.tags) ? dataNode.tags.length : 0
  const projectsByArray = Array.isArray(dataNode.projects) ? dataNode.projects.length : 0
  const postsByArray = Array.isArray(dataNode.posts) ? dataNode.posts.length : 0
  const settingsByArray = Array.isArray(dataNode.settings) ? dataNode.settings.length : 0

  return {
    format: typeof meta.format === 'string' ? meta.format : 'unknown',
    version: typeof meta.version === 'string' ? meta.version : 'unknown',
    categories: categoriesByCount || categoriesByArray,
    tags: tagsByCount || tagsByArray,
    projects: projectsByCount || projectsByArray,
    posts: postsByCount || postsByArray,
    settings: settingsByCount || settingsByArray,
  }
}

function toTaskStatusLabel(status: TaskStatus) {
  if (status === 'pending') return '排队中'
  if (status === 'running') return '执行中'
  if (status === 'succeeded') return '已完成'
  return '失败'
}

function toTaskBadgeVariant(status: TaskStatus): 'secondary' | 'outline' | 'default' | 'destructive' {
  if (status === 'pending') return 'outline'
  if (status === 'running') return 'default'
  if (status === 'succeeded') return 'secondary'
  return 'destructive'
}

function extractBackupSummary(result: unknown): BackupSummary | null {
  if (!isRecord(result) || !isRecord(result.summary)) return null
  return result.summary as BackupSummary
}

function extractMigrationSummary(result: unknown): MigrationSummary | null {
  if (!isRecord(result) || !isRecord(result.summary)) return null
  return result.summary as MigrationSummary
}

export default function AdminImportExportPage() {
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<'backup' | 'migration'>('backup')

  const [includeSensitiveExport, setIncludeSensitiveExport] = useState(false)
  const [includeSensitiveImport, setIncludeSensitiveImport] = useState(false)
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null)
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null)
  const [backupImportConfirmOpen, setBackupImportConfirmOpen] = useState(false)

  const [migrationSource, setMigrationSource] = useState<'auto' | 'hexo' | 'hugo'>('auto')
  const [selectedMigrationFile, setSelectedMigrationFile] = useState<File | null>(null)
  const [migrationImportConfirmOpen, setMigrationImportConfirmOpen] = useState(false)

  const [task, setTask] = useState<PublicTaskRecord | null>(null)
  const [submittingType, setSubmittingType] = useState<TaskType | null>(null)

  const taskBusy = task ? task.status === 'pending' || task.status === 'running' : false
  const creatingTask = submittingType !== null
  const operationBusy = taskBusy || creatingTask
  const taskId = task?.id || ''
  const taskStatus = task?.status || null

  useEffect(() => {
    if (!taskId || (taskStatus !== 'pending' && taskStatus !== 'running')) {
      return
    }

    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/import-export/tasks/${taskId}`, { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return
        if (!cancelled && isRecord(data) && isRecord(data.task)) {
          setTask(data.task as PublicTaskRecord)
        }
      } catch {
        // noop
      }
    }

    void poll()
    const timer = setInterval(() => {
      void poll()
    }, 2000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [taskId, taskStatus])

  const createTaskRequest = async (input: {
    type: TaskType
    includeSensitive?: boolean
    source?: 'auto' | 'hexo' | 'hugo'
    file?: File | null
  }) => {
    setSubmittingType(input.type)
    try {
      const formData = new FormData()
      formData.append('type', input.type)
      if (input.includeSensitive) {
        formData.append('includeSensitive', '1')
      }
      if (input.source) {
        formData.append('source', input.source)
      }
      if (input.file) {
        formData.append('file', input.file)
      }

      const res = await fetch('/api/admin/import-export/tasks', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(isRecord(data) && typeof data.error === 'string' ? data.error : '提交任务失败')
      }

      if (!isRecord(data) || !isRecord(data.task)) {
        throw new Error('任务返回格式错误')
      }

      const createdTask = data.task as PublicTaskRecord
      setTask(createdTask)
      toast({
        title: '任务已提交',
        description: `任务 ${createdTask.id.slice(0, 8)} 已进入后台执行`,
      })
    } catch (error) {
      toast({
        title: '提交失败',
        description: error instanceof Error ? error.message : '提交任务失败',
        variant: 'destructive',
      })
    } finally {
      setSubmittingType(null)
    }
  }

  const handleSelectBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    setSelectedBackupFile(file)
    setBackupPreview(null)

    if (!file) return

    try {
      const text = await file.text()
      const json = JSON.parse(text) as unknown
      setBackupPreview(extractBackupPreview(json))
    } catch (error) {
      console.error('解析备份文件失败:', error)
      setSelectedBackupFile(null)
      toast({
        title: '解析失败',
        description: '请选择有效的 JSON 备份文件',
        variant: 'destructive',
      })
    }
  }

  const handleStartBackupImport = async () => {
    if (!selectedBackupFile) {
      toast({ title: '提示', description: '请先选择 JSON 文件', variant: 'destructive' })
      return
    }
    setBackupImportConfirmOpen(false)
    await createTaskRequest({
      type: 'backup_import',
      includeSensitive: includeSensitiveImport,
      file: selectedBackupFile,
    })
  }

  const handleStartMigrationImport = async () => {
    if (!selectedMigrationFile) {
      toast({ title: '提示', description: '请先选择迁移文件', variant: 'destructive' })
      return
    }
    setMigrationImportConfirmOpen(false)
    await createTaskRequest({
      type: 'migration_import',
      source: migrationSource,
      file: selectedMigrationFile,
    })
  }

  const backupSummary = useMemo(() => {
    if (!task || task.type !== 'backup_import' || task.status !== 'succeeded') return null
    return extractBackupSummary(task.result)
  }, [task])

  const migrationSummary = useMemo(() => {
    if (!task || task.type !== 'migration_import' || task.status !== 'succeeded') return null
    return extractMigrationSummary(task.result)
  }, [task])

  const taskTypeLabel = useMemo(() => {
    if (!task) return ''
    if (task.type === 'backup_export') return '系统备份导出'
    if (task.type === 'backup_import') return '系统备份导入'
    if (task.type === 'migration_export') return '迁移导出（Markdown ZIP）'
    return '迁移导入（Markdown/ZIP）'
  }, [task])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">导入导出</h1>
        <p className="text-muted-foreground">所有操作均以异步任务执行，页面不会被长时间阻塞。</p>
      </div>

      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm ${activeTab === 'backup' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('backup')}
        >
          系统备份
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm ${activeTab === 'migration' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setActiveTab('migration')}
        >
          博客迁移
        </button>
      </div>

      {task && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <span>任务状态</span>
              <Badge variant={toTaskBadgeVariant(task.status)}>{toTaskStatusLabel(task.status)}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>任务类型：{taskTypeLabel}</p>
            <p>任务 ID：{task.id}</p>
            <p>创建时间：{new Date(task.createdAt).toLocaleString('zh-CN')}</p>
            {task.finishedAt && <p>完成时间：{new Date(task.finishedAt).toLocaleString('zh-CN')}</p>}
            {task.error && <p className="text-red-600 dark:text-red-400">错误信息：{task.error}</p>}

            {task.status === 'succeeded' && task.downloadUrl && (
              <Button size="sm" asChild>
                <a href={task.downloadUrl}>
                  <Download className="mr-2 h-4 w-4" />
                  下载结果文件
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'backup' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>导出备份（JSON）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeSensitiveExport}
                  onChange={(event) => setIncludeSensitiveExport(event.target.checked)}
                  disabled={operationBusy}
                />
                包含敏感字段（密码哈希、敏感设置）
              </label>
              <Button
                onClick={() => {
                  void createTaskRequest({
                    type: 'backup_export',
                    includeSensitive: includeSensitiveExport,
                  })
                }}
                disabled={operationBusy}
              >
                {submittingType === 'backup_export' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                创建导出任务
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>导入备份（JSON）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="backup-import-file">选择备份文件</Label>
                <Input
                  id="backup-import-file"
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    void handleSelectBackupFile(event)
                  }}
                  disabled={operationBusy}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeSensitiveImport}
                  onChange={(event) => setIncludeSensitiveImport(event.target.checked)}
                  disabled={operationBusy}
                />
                允许导入敏感字段
              </label>

              {selectedBackupFile && backupPreview && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40">
                  <p>文件：{selectedBackupFile.name}</p>
                  <p>格式：{backupPreview.format}</p>
                  <p>版本：{backupPreview.version}</p>
                  <p>
                    预计导入：分类 {backupPreview.categories} / 标签 {backupPreview.tags} / 作品 {backupPreview.projects} /
                    文章 {backupPreview.posts} / 设置 {backupPreview.settings}
                  </p>
                </div>
              )}

              <Button
                onClick={() => setBackupImportConfirmOpen(true)}
                disabled={!selectedBackupFile || operationBusy}
              >
                {submittingType === 'backup_import' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                创建导入任务
              </Button>
            </CardContent>
          </Card>

          {backupSummary && (
            <Card>
              <CardHeader>
                <CardTitle>系统备份导入结果</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>分类：新增 {backupSummary.categories.created} / 更新 {backupSummary.categories.updated} / 跳过 {backupSummary.categories.skipped}</p>
                <p>标签：新增 {backupSummary.tags.created} / 更新 {backupSummary.tags.updated} / 跳过 {backupSummary.tags.skipped}</p>
                <p>作品：新增 {backupSummary.projects.created} / 更新 {backupSummary.projects.updated} / 跳过 {backupSummary.projects.skipped}</p>
                <p>文章：新增 {backupSummary.posts.created} / 更新 {backupSummary.posts.updated} / 跳过 {backupSummary.posts.skipped}</p>
                <p>设置：新增 {backupSummary.settings.created} / 更新 {backupSummary.settings.updated} / 跳过 {backupSummary.settings.skipped}</p>
                <p>
                  自动补全：分类 {backupSummary.autoCreatedFromPosts.categories} 个，标签{' '}
                  {backupSummary.autoCreatedFromPosts.tags} 个
                </p>
                {backupSummary.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
                    <p className="font-medium">告警</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {backupSummary.warnings.map((warning, index) => (
                        <li key={`${index}-${warning}`}>{warning}</li>
                      ))}
                    </ul>
                    {backupSummary.warningOverflow > 0 && (
                      <p className="mt-2 text-xs">还有 {backupSummary.warningOverflow} 条告警未展示。</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {activeTab === 'migration' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>迁移导出（ZIP + Front-matter Markdown）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>导出结果默认为 ZIP 包，内含多篇 Markdown 文件，每篇文件带 YAML Front-matter：</p>
              <p className="text-muted-foreground">包含字段：title、date、updated、tags、categories。</p>
              <Button
                onClick={() => {
                  void createTaskRequest({
                    type: 'migration_export',
                  })
                }}
                disabled={operationBusy}
              >
                {submittingType === 'migration_export' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                创建迁移导出任务
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>迁移导入（支持 ZIP / Markdown）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="migration-source">迁移来源</Label>
                <select
                  id="migration-source"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={migrationSource}
                  onChange={(event) => setMigrationSource(event.target.value as 'auto' | 'hexo' | 'hugo')}
                  disabled={operationBusy}
                >
                  <option value="auto">自动识别</option>
                  <option value="hexo">Hexo</option>
                  <option value="hugo">Hugo</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="migration-import-file">选择文件</Label>
                <Input
                  id="migration-import-file"
                  type="file"
                  accept=".zip,.md,.markdown,.mdx,text/markdown,application/zip"
                  onChange={(event) => setSelectedMigrationFile(event.target.files?.[0] || null)}
                  disabled={operationBusy}
                />
                <p className="text-xs text-muted-foreground">
                  Front-matter 将提取：title、date、updated、tags、categories。
                </p>
              </div>

              {selectedMigrationFile && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40">
                  <p>文件：{selectedMigrationFile.name}</p>
                  <p>大小：{(selectedMigrationFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  <p>来源：{migrationSource.toUpperCase()}</p>
                </div>
              )}

              <Button
                onClick={() => setMigrationImportConfirmOpen(true)}
                disabled={!selectedMigrationFile || operationBusy}
              >
                {submittingType === 'migration_import' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                创建迁移导入任务
              </Button>
            </CardContent>
          </Card>

          {migrationSummary && (
            <Card>
              <CardHeader>
                <CardTitle>迁移导入结果</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>来源：{migrationSummary.source.toUpperCase()}</p>
                <p>文章：新增 {migrationSummary.posts.created} / 更新 {migrationSummary.posts.updated} / 跳过 {migrationSummary.posts.skipped}</p>
                <p>分类：新增 {migrationSummary.categories.created} / 更新 {migrationSummary.categories.updated} / 跳过 {migrationSummary.categories.skipped}</p>
                <p>标签：新增 {migrationSummary.tags.created} / 更新 {migrationSummary.tags.updated} / 跳过 {migrationSummary.tags.skipped}</p>
                {migrationSummary.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
                    <p className="font-medium">告警</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {migrationSummary.warnings.map((warning, index) => (
                        <li key={`${index}-${warning}`}>{warning}</li>
                      ))}
                    </ul>
                    {migrationSummary.warningOverflow > 0 && (
                      <p className="mt-2 text-xs">还有 {migrationSummary.warningOverflow} 条告警未展示。</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <AlertDialog open={backupImportConfirmOpen} onOpenChange={setBackupImportConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认执行系统备份导入</AlertDialogTitle>
            <AlertDialogDescription>
              将按 slug/key 合并更新现有数据，任务会在后台异步执行。是否继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void handleStartBackupImport() }}>
              确认导入
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={migrationImportConfirmOpen} onOpenChange={setMigrationImportConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认执行迁移导入</AlertDialogTitle>
            <AlertDialogDescription>
              将解析 Markdown Front-matter 并写入文章/分类/标签，任务会在后台异步执行。是否继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void handleStartMigrationImport() }}>
              确认导入
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
