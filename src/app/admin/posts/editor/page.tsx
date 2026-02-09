'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Save, Eye } from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'
import { ImagePickerDialog } from '@/components/admin/image-picker-dialog'
import { MarkdownEditor } from '@/components/admin/markdown-editor'

function PostEditorContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const postId = searchParams.get('id') as string | null
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    content: '',
    excerpt: '',
    coverImage: '',
    status: 'DRAFT',
    locale: 'zh',
    categoryId: '',
    createdAt: '',
    isProtected: false,
    password: '',
  })

  const [categories, setCategories] = useState<any[]>([])
  const [tags, setTags] = useState<any[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [metaInfo, setMetaInfo] = useState<{ createdAt?: string; updatedAt?: string }>({})
  const [hasPassword, setHasPassword] = useState(false)

  const toInputDateTime = (value?: string | Date | null) => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  useEffect(() => {
    const created = searchParams.get('created')
    const published = searchParams.get('published')
    if (created === '1') {
      toast({
        title: published === '1' ? '发布成功' : '保存成功',
        description: published === '1' ? '文章已发布' : '文章已保存为草稿',
      })
      const params = new URLSearchParams(searchParams.toString())
      params.delete('created')
      params.delete('published')
      router.replace(`/admin/posts/editor?${params.toString()}`)
    }
  }, [router, searchParams, toast])

  // 加载分类列表
  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => {
        if (data.categories) {
          setCategories(data.categories)
        }
      })
      .catch((error) => {
        console.error('加载分类失败:', error)
      })
  }, [])

  // 加载标签列表
  useEffect(() => {
    fetch('/api/tags')
      .then((res) => res.json())
      .then((data) => {
        if (data.tags) {
          setTags(data.tags)
        }
      })
      .catch((error) => {
        console.error('加载标签失败:', error)
      })
  }, [])

  // 新建文章默认分类为“未分类”
  useEffect(() => {
    if (!postId && !formData.categoryId && categories.length > 0) {
      const uncategorized = categories.find(
        (cat) => cat.slug === 'uncategorized' || cat.name === '未分类'
      )
      if (uncategorized) {
        setFormData((prev) => ({ ...prev, categoryId: uncategorized.id }))
      }
    }
  }, [postId, formData.categoryId, categories])

  useEffect(() => {
    if (!postId && !formData.createdAt) {
      setFormData((prev) => ({ ...prev, createdAt: toInputDateTime(new Date()) }))
    }
  }, [postId, formData.createdAt])

  // 如果是编辑模式,加载文章数据
  useEffect(() => {
    if (postId) {
      setLoading(true)
      fetch(`/api/posts/${postId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.post) {
            setFormData({
              title: data.post.title,
              slug: data.post.slug,
              content: data.post.content,
              excerpt: data.post.excerpt || '',
              coverImage: data.post.coverImage || '',
              status: data.post.status,
              locale: data.post.locale,
              categoryId: data.post.categoryId || '',
              createdAt: toInputDateTime(data.post.createdAt),
              isProtected: Boolean(data.post.isProtected),
              password: '',
            })
            setHasPassword(Boolean(data.post.hasPassword))
            setSelectedTagIds(
              Array.isArray(data.post.postTags)
                ? data.post.postTags.map((pt: any) => pt.tagId || pt.tag?.id).filter(Boolean)
                : []
            )
            setMetaInfo({
              createdAt: data.post.createdAt,
              updatedAt: data.post.updatedAt,
            })
          }
        })
        .catch((error) => {
          console.error('加载文章失败:', error)
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [postId ?? false])

  // 自动生成 slug
  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  const handleTitleChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      title: value,
      slug: postId ? prev.slug : generateSlug(value),
    }))
  }

  const handleSubmit = async (publish = false) => {
    setSaving(true)

    try {
      if (formData.isProtected && !formData.password.trim() && !hasPassword) {
        toast({
          title: '无法保存',
          description: '启用加密时必须设置访问密码',
          variant: 'destructive',
        })
        setSaving(false)
        return
      }

      const url = postId ? `/api/posts/${postId}` : '/api/posts'
      const method = postId ? 'PATCH' : 'POST'
      const payload: Record<string, any> = {
        ...formData,
        status: publish ? 'PUBLISHED' : 'DRAFT',
        tags: selectedTagIds,
      }
      if (!payload.isProtected) {
        delete payload.password
      } else if (!payload.password || !payload.password.trim()) {
        delete payload.password
      } else {
        payload.password = payload.password.trim()
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...payload,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '保存失败')
      }

      // 保存成功
      if (!postId && data.post) {
        // 如果是新创建的文章,跳转到编辑页面
        router.push(`/admin/posts/editor?id=${data.post.id}&created=1&published=${publish ? '1' : '0'}`)
      } else {
        if (data.post) {
          setMetaInfo({
            createdAt: data.post.createdAt,
            updatedAt: data.post.updatedAt,
          })
        }
        setHasPassword(formData.isProtected)
        if (formData.password.trim()) {
          setFormData((prev) => ({ ...prev, password: '' }))
        }
        toast({
          title: publish ? '发布成功' : '保存成功',
          description: publish ? '文章已发布' : '文章已保存为草稿',
        })
      }
    } catch (error) {
      console.error('保存失败:', error)
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '保存失败,请稍后重试',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-lg text-gray-600 dark:text-gray-400">
          加载中...
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* 头部操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/posts">
            <Button size="sm" variant="ghost">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">
              {postId ? '编辑文章' : '新建文章'}
            </h1>
            {postId && metaInfo.updatedAt && (
              <p className="text-xs text-muted-foreground mt-1">
                最后保存时间: {new Date(metaInfo.updatedAt).toLocaleString('zh-CN')}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleSubmit(false)}
            disabled={saving}
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? '保存中...' : '保存草稿'}
          </Button>
          <Button
            size="sm"
            onClick={() => handleSubmit(true)}
            disabled={saving}
          >
            <Eye className="mr-2 h-4 w-4" />
            {saving ? '发布中...' : '发布'}
          </Button>
        </div>
      </div>

      {/* 文章表单 */}
      <div className="space-y-6">
        {/* 基本信息 */}
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">标题 *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="输入文章标题"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">URL Slug（自动生成）</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  placeholder="post-url-slug"
                  disabled
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="excerpt">摘要</Label>
              <Textarea
                id="excerpt"
                value={formData.excerpt}
                onChange={(e) =>
                  setFormData({ ...formData, excerpt: e.target.value })
                }
                placeholder="简短描述文章内容..."
                rows={3}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="createdAt">创建时间</Label>
              <Input
                id="createdAt"
                type="datetime-local"
                value={formData.createdAt}
                onChange={(e) => setFormData({ ...formData, createdAt: e.target.value })}
                disabled={saving}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="status">状态</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({ ...formData, status: value })
                  }
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">草稿</SelectItem>
                    <SelectItem value="PUBLISHED">已发布</SelectItem>
                    <SelectItem value="ARCHIVED">已归档</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="locale">语言</Label>
                <Select
                  value={formData.locale}
                  onValueChange={(value) =>
                    setFormData({ ...formData, locale: value })
                  }
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">分类</Label>
                <Select
                  value={formData.categoryId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, categoryId: value })
                  }
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>标签</Label>
              {tags.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  暂无标签，
                  <Link href="/admin/tags" className="text-blue-600 hover:underline">
                    去创建
                  </Link>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => {
                    const checked = selectedTagIds.includes(tag.id)
                    return (
                      <label
                        key={tag.id}
                        className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors ${
                          checked
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-200'
                            : 'border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={checked}
                          disabled={saving}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selectedTagIds, tag.id]
                              : selectedTagIds.filter((id) => id !== tag.id)
                            setSelectedTagIds(next)
                          }}
                        />
                        #{tag.name}
                      </label>
                    )
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">可多选</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="coverImage">封面图片 URL</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="coverImage"
                  className="sm:flex-1"
                  value={formData.coverImage}
                  onChange={(e) =>
                    setFormData({ ...formData, coverImage: e.target.value })
                  }
                  placeholder="https://example.com/image.jpg"
                  disabled={saving}
                />
                <ImagePickerDialog
                  disabled={saving}
                  triggerText="从文件管理选择"
                  title="选择文章封面"
                  onSelect={(url) => setFormData((prev) => ({ ...prev, coverImage: url }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>文章加密</Label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={formData.isProtected}
                  disabled={saving}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setFormData((prev) => ({
                      ...prev,
                      isProtected: checked,
                      password: checked ? prev.password : '',
                    }))
                    if (!checked) {
                      setHasPassword(false)
                    }
                  }}
                />
                启用访问密码
              </label>
              <p className="text-xs text-muted-foreground">
                启用后访问需输入密码，仅当前标签页记住解锁状态。
              </p>
            </div>

            {formData.isProtected && (
              <div className="space-y-2">
                <Label htmlFor="postPassword">访问密码</Label>
                <Input
                  id="postPassword"
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  placeholder={hasPassword ? '留空则保持原密码' : '设置访问密码'}
                  disabled={saving}
                />
                {hasPassword && (
                  <p className="text-xs text-muted-foreground">留空则保持原密码</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 内容编辑 */}
        <Card>
          <CardHeader>
            <CardTitle>文章内容</CardTitle>
            <p className="text-sm text-muted-foreground">
              支持 Markdown 语法
            </p>
          </CardHeader>
          <CardContent>
            <MarkdownEditor
              value={formData.content}
              onChange={(v) => setFormData({ ...formData, content: v })}
              disabled={saving}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function PostEditorPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center p-6">正在加载编辑器...</div>}>
      <PostEditorContent />
    </Suspense>
  )
}
