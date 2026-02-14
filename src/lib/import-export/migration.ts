import { PostStatus } from '@prisma/client'
import slugify from 'slugify'
import readingTime from 'reading-time'
import { prisma } from '@/lib/prisma'
import { buildYamlFrontMatter, parseFrontMatter } from './front-matter'
import { createZip, extractZipEntries } from './zip'

export type MigrationSource = 'auto' | 'hexo' | 'hugo'

type Counter = {
  created: number
  updated: number
  skipped: number
}

export type MigrationImportSummary = {
  posts: Counter
  categories: Counter
  tags: Counter
  warnings: string[]
  warningOverflow: number
  source: MigrationSource
}

type ParsedMigrationPost = {
  originFile: string
  title: string
  slug: string
  content: string
  createdAt: Date
  updatedAt?: Date
  tags: string[]
  categories: string[]
  published: boolean
}

const MAX_WARNINGS = 80
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx'])

function createCounter(): Counter {
  return {
    created: 0,
    updated: 0,
    skipped: 0,
  }
}

function createSummary(source: MigrationSource): MigrationImportSummary {
  return {
    posts: createCounter(),
    categories: createCounter(),
    tags: createCounter(),
    warnings: [],
    warningOverflow: 0,
    source,
  }
}

function pushWarning(summary: MigrationImportSummary, message: string) {
  if (summary.warnings.length < MAX_WARNINGS) {
    summary.warnings.push(message)
    return
  }
  summary.warningOverflow += 1
}

function getFileExtension(name: string) {
  const index = name.lastIndexOf('.')
  if (index < 0) return ''
  return name.slice(index).toLowerCase()
}

function getFileNameBase(name: string) {
  const normalized = name.replace(/\\/g, '/')
  const fileName = normalized.split('/').pop() || normalized
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

function toUniqueList(values: string[]) {
  return Array.from(new Set(values.map((it) => it.trim()).filter(Boolean)))
}

function normalizeEntityName(name: string, maxLength = 120) {
  return name.trim().slice(0, maxLength)
}

function normalizeSlug(input: string, fallback: string) {
  const fromTitle = slugify(input, { lower: true, strict: true, trim: true })
  if (fromTitle) return fromTitle
  const fromFallback = slugify(fallback, { lower: true, strict: true, trim: true })
  return fromFallback || `post-${Date.now()}`
}

function parseMarkdownPost(
  fileName: string,
  content: string,
  source: MigrationSource
): ParsedMigrationPost | null {
  const parsed = parseFrontMatter(content)
  const fallbackTitle = getFileNameBase(fileName)
  const title = parsed.fields.title || fallbackTitle || 'Untitled'
  const slugSource = parsed.fields.slug || fallbackTitle || title
  const slugFallback = fallbackTitle || title
  const slug = normalizeSlug(slugSource, slugFallback)
  const createdAt = parsed.fields.date || new Date()
  const updatedAt = parsed.fields.updated
  const tags = toUniqueList(parsed.fields.tags || [])
  const categories = toUniqueList(parsed.fields.categories || [])
  const normalizedPath = fileName.replace(/\\/g, '/').toLowerCase()
  const hexoDraftByPath = normalizedPath.includes('/_draft/') || normalizedPath.startsWith('_draft/')
  const published = parsed.fields.published === true && !(source === 'hexo' && hexoDraftByPath)
  const body = parsed.body.trim()

  if (!body) {
    return null
  }

  return {
    originFile: fileName,
    title,
    slug,
    content: body,
    createdAt,
    updatedAt,
    tags,
    categories,
    published,
  }
}

async function ensureCategoryByName(
  name: string,
  summary: MigrationImportSummary,
  categoryIdByName: Map<string, string>
) {
  const normalizedName = normalizeEntityName(name, 120)
  if (!normalizedName) return null

  const cachedId = categoryIdByName.get(normalizedName)
  if (cachedId) return cachedId

  const byName = await prisma.category.findUnique({
    where: { name: normalizedName },
    select: { id: true },
  })
  if (byName) {
    categoryIdByName.set(normalizedName, byName.id)
    return byName.id
  }

  let slugBase = slugify(normalizedName, { lower: true, strict: true, trim: true })
  if (!slugBase) slugBase = 'category'
  let slug = slugBase
  let suffix = 1

  while (await prisma.category.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${slugBase}-${suffix}`
    suffix += 1
  }

  const created = await prisma.category.create({
    data: {
      name: normalizedName,
      slug,
    },
    select: { id: true },
  })

  summary.categories.created += 1
  categoryIdByName.set(normalizedName, created.id)
  return created.id
}

async function ensureTagByName(
  name: string,
  summary: MigrationImportSummary,
  tagIdByName: Map<string, string>
) {
  const normalizedName = normalizeEntityName(name, 120)
  if (!normalizedName) return null

  const cachedId = tagIdByName.get(normalizedName)
  if (cachedId) return cachedId

  const byName = await prisma.tag.findUnique({
    where: { name: normalizedName },
    select: { id: true },
  })
  if (byName) {
    tagIdByName.set(normalizedName, byName.id)
    return byName.id
  }

  let slugBase = slugify(normalizedName, { lower: true, strict: true, trim: true })
  if (!slugBase) slugBase = 'tag'
  let slug = slugBase
  let suffix = 1

  while (await prisma.tag.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${slugBase}-${suffix}`
    suffix += 1
  }

  const created = await prisma.tag.create({
    data: {
      name: normalizedName,
      slug,
    },
    select: { id: true },
  })

  summary.tags.created += 1
  tagIdByName.set(normalizedName, created.id)
  return created.id
}

export async function exportMigrationMarkdownZip() {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      title: true,
      slug: true,
      content: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      category: {
        select: { name: true },
      },
      postTags: {
        select: {
          tag: {
            select: { name: true },
          },
        },
      },
    },
  })

  const usedNames = new Set<string>()
  const entries: Array<{ name: string; data: Buffer }> = []

  for (const post of posts) {
    const frontMatter = buildYamlFrontMatter({
      title: post.title,
      slug: post.slug,
      date: post.createdAt,
      updated: post.updatedAt,
      tags: post.postTags.map((item) => item.tag.name),
      categories: post.category?.name ? [post.category.name] : [],
      published: post.status === PostStatus.PUBLISHED,
    })

    const body = post.content.endsWith('\n') ? post.content : `${post.content}\n`
    const markdown = `${frontMatter}\n${body}`

    let fileName = `${post.slug}.md`
    if (usedNames.has(fileName)) {
      let suffix = 1
      while (usedNames.has(`${post.slug}-${suffix}.md`)) {
        suffix += 1
      }
      fileName = `${post.slug}-${suffix}.md`
    }
    usedNames.add(fileName)

    entries.push({
      name: fileName,
      data: Buffer.from(markdown, 'utf8'),
    })
  }

  const zip = createZip(entries)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

  return {
    fileName: `papergrid-migration-${timestamp}.zip`,
    mimeType: 'application/zip',
    fileBuffer: zip,
    postCount: posts.length,
  }
}

export async function importMigrationMarkdown(input: {
  fileName: string
  fileBuffer: Buffer
  source: MigrationSource
  userId: string
}) {
  const summary = createSummary(input.source)
  const extension = getFileExtension(input.fileName)

  const markdownFiles: Array<{ name: string; content: string }> = []

  if (extension === '.zip') {
    const entries = await extractZipEntries(input.fileBuffer)
    for (const entry of entries) {
      const entryExt = getFileExtension(entry.name)
      if (!MARKDOWN_EXTENSIONS.has(entryExt)) continue
      markdownFiles.push({
        name: entry.name,
        content: entry.data.toString('utf8'),
      })
    }
  } else if (MARKDOWN_EXTENSIONS.has(extension)) {
    markdownFiles.push({
      name: input.fileName,
      content: input.fileBuffer.toString('utf8'),
    })
  } else {
    throw new Error('仅支持导入 .md / .markdown / .mdx / .zip 文件')
  }

  if (markdownFiles.length === 0) {
    throw new Error('未在文件中找到可导入的 Markdown 文章')
  }

  const parsedPosts: ParsedMigrationPost[] = []

  for (const file of markdownFiles) {
    try {
      const parsed = parseMarkdownPost(file.name, file.content, input.source)
      if (!parsed) {
        summary.posts.skipped += 1
        pushWarning(summary, `文件 "${file.name}" 内容为空，已跳过`)
        continue
      }
      parsedPosts.push(parsed)
    } catch (error) {
      console.error('迁移导入失败:', error)
      summary.posts.skipped += 1
      pushWarning(summary, `文件 "${file.name}" 导入失败`)
    }
  }

  const categoryNames = Array.from(new Set(
    parsedPosts
      .map((post) => normalizeEntityName(post.categories[0] || '', 120))
      .filter(Boolean)
  ))
  const tagNames = Array.from(new Set(
    parsedPosts
      .flatMap((post) => post.tags.map((tag) => normalizeEntityName(tag, 120)))
      .filter(Boolean)
  ))

  const existingCategoriesPromise = categoryNames.length > 0
    ? prisma.category.findMany({
      where: { name: { in: categoryNames } },
      select: {
        name: true,
        id: true,
      },
    })
    : Promise.resolve([] as Array<{ name: string; id: string }>)
  const existingTagsPromise = tagNames.length > 0
    ? prisma.tag.findMany({
      where: { name: { in: tagNames } },
      select: {
        name: true,
        id: true,
      },
    })
    : Promise.resolve([] as Array<{ name: string; id: string }>)

  const [existingCategories, existingTags] = await Promise.all([
    existingCategoriesPromise,
    existingTagsPromise,
  ])

  const categoryIdByName = new Map(existingCategories.map((item) => [item.name, item.id]))
  const tagIdByName = new Map(existingTags.map((item) => [item.name, item.id]))

  for (const parsed of parsedPosts) {
    try {
      const categoryName = normalizeEntityName(parsed.categories[0] || '', 120)
      const categoryId = categoryName
        ? await ensureCategoryByName(categoryName, summary, categoryIdByName)
        : null

      const tagIds: string[] = []
      for (const rawTagName of parsed.tags) {
        const tagName = normalizeEntityName(rawTagName, 120)
        if (!tagName) continue
        const tagId = await ensureTagByName(tagName, summary, tagIdByName)
        if (tagId) tagIds.push(tagId)
      }
      const uniqueTagIds = Array.from(new Set(tagIds))

      const status = parsed.published ? PostStatus.PUBLISHED : PostStatus.DRAFT
      const publishedAt = status === PostStatus.PUBLISHED ? parsed.createdAt : null
      const nextUpdatedAt = parsed.updatedAt || parsed.createdAt

      const existing = await prisma.post.findUnique({
        where: { slug: parsed.slug },
        select: {
          id: true,
          isProtected: true,
          passwordHash: true,
        },
      })

      if (existing) {
        await prisma.post.update({
          where: { id: existing.id },
          data: {
            title: parsed.title,
            content: parsed.content,
            excerpt: null,
            coverImage: null,
            status,
            locale: 'zh',
            categoryId,
            // 迁移更新仅覆盖文章内容，不改变既有加密状态
            isProtected: existing.isProtected,
            passwordHash: existing.passwordHash,
            readingTime: Math.max(1, Math.round(readingTime(parsed.content).minutes)),
            createdAt: parsed.createdAt,
            updatedAt: nextUpdatedAt,
            publishedAt,
            postTags: {
              deleteMany: {},
              create: uniqueTagIds.map((tagId) => ({ tagId })),
            },
          },
        })
        summary.posts.updated += 1
      } else {
        await prisma.post.create({
          data: {
            title: parsed.title,
            slug: parsed.slug,
            content: parsed.content,
            excerpt: null,
            coverImage: null,
            status,
            locale: 'zh',
            categoryId,
            authorId: input.userId,
            isProtected: false,
            passwordHash: null,
            readingTime: Math.max(1, Math.round(readingTime(parsed.content).minutes)),
            createdAt: parsed.createdAt,
            updatedAt: nextUpdatedAt,
            publishedAt,
            postTags: {
              create: uniqueTagIds.map((tagId) => ({ tagId })),
            },
          },
        })
        summary.posts.created += 1
      }
    } catch (error) {
      console.error('迁移导入失败:', error)
      summary.posts.skipped += 1
      pushWarning(summary, `文件 "${parsed.originFile}" 导入失败`)
    }
  }

  return {
    summary,
    importedCount: markdownFiles.length,
  }
}
