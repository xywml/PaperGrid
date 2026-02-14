import { PostStatus, Prisma } from '@prisma/client'
import readingTime from 'reading-time'
import { prisma } from '@/lib/prisma'

type Counter = {
  created: number
  updated: number
  skipped: number
}

export type BackupPayload = {
  meta: {
    format: 'papergrid-backup'
    version: '1.0.0'
    exportedAt: string
    includeSensitive: boolean
  }
  counts: {
    categories: number
    tags: number
    projects: number
    posts: number
    settings: number
  }
  data: {
    categories: Array<{
      name: string
      slug: string
      description: string | null
      createdAt: string
      updatedAt: string
    }>
    tags: Array<{
      name: string
      slug: string
      createdAt: string
      updatedAt: string
    }>
    projects: Array<{
      name: string
      url: string
      description: string | null
      image: string | null
      createdAt: string
      updatedAt: string
    }>
    posts: Array<{
      title: string
      slug: string
      content: string
      excerpt: string | null
      coverImage: string | null
      status: PostStatus
      locale: string
      publishedAt: string | null
      createdAt: string
      updatedAt: string
      isProtected: boolean
      passwordHash?: string | null
      categorySlug: string | null
      tagSlugs: string[]
    }>
    settings: Array<{
      key: string
      value: unknown
      group: string
      editable: boolean
      secret: boolean
      description: string | null
    }>
  }
}

export type BackupImportSummary = {
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

type RecordNode = Record<string, unknown>

type ExistingSettingSnapshot = {
  id: string
  key: string
  editable: boolean
  secret: boolean
}

type ExistingPostSnapshot = {
  id: string
  slug: string
  passwordHash: string | null
  publishedAt: Date | null
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/
const MAX_WARNINGS = 80

function createCounter(): Counter {
  return {
    created: 0,
    updated: 0,
    skipped: 0,
  }
}

function createSummary(): BackupImportSummary {
  return {
    categories: createCounter(),
    tags: createCounter(),
    projects: createCounter(),
    posts: createCounter(),
    settings: createCounter(),
    autoCreatedFromPosts: {
      categories: 0,
      tags: 0,
    },
    warnings: [],
    warningOverflow: 0,
  }
}

function isRecord(value: unknown): value is RecordNode {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toBooleanFlag(value: string | null | undefined): boolean {
  if (!value) return false
  return TRUE_VALUES.has(value.toLowerCase())
}

function pickString(value: unknown, maxLength = 255): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function pickLongString(value: unknown, maxLength = 2000000): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function pickRawString(value: unknown, maxLength = 2000000): string | null {
  if (typeof value !== 'string') return null
  const clipped = value.slice(0, maxLength)
  return clipped.length > 0 ? clipped : null
}

function pickDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === undefined || value === null) {
    return {}
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
  } catch {
    return {}
  }
}

function toStringArray(value: unknown, maxLength = 180): string[] {
  if (!Array.isArray(value)) return []

  const result: string[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (typeof item !== 'string') continue
    const normalized = item.trim().slice(0, maxLength)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function normalizePostStatus(value: unknown): PostStatus {
  if (typeof value !== 'string') return PostStatus.DRAFT
  const normalized = value.toUpperCase()
  return normalized in PostStatus
    ? (normalized as PostStatus)
    : PostStatus.DRAFT
}

function normalizeLocale(value: unknown): string {
  if (typeof value !== 'string') return 'zh'
  const normalized = value.trim().slice(0, 12)
  return normalized || 'zh'
}

function isBcryptHash(value: string): boolean {
  return BCRYPT_HASH_PATTERN.test(value)
}

function getDataNode(value: unknown): RecordNode | null {
  if (!isRecord(value)) return null

  if (isRecord(value.data)) {
    return value.data
  }

  return value
}

function toRecordArray(value: unknown): RecordNode[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is RecordNode => isRecord(item))
}

function toDisplayNameFromSlug(slug: string): string {
  const normalized = slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized ? normalized.slice(0, 120) : slug.slice(0, 120)
}

function pushWarning(summary: BackupImportSummary, message: string) {
  if (summary.warnings.length < MAX_WARNINGS) {
    summary.warnings.push(message)
    return
  }
  summary.warningOverflow += 1
}

export async function exportBackupData(includeSensitive: boolean): Promise<BackupPayload> {
  const [categories, tags, projects, posts, settings] = await Promise.all([
    prisma.category.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        name: true,
        slug: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.tag.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.project.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        name: true,
        url: true,
        description: true,
        image: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.post.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        title: true,
        slug: true,
        content: true,
        excerpt: true,
        coverImage: true,
        status: true,
        locale: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        isProtected: true,
        passwordHash: true,
        category: {
          select: {
            slug: true,
          },
        },
        postTags: {
          select: {
            tag: {
              select: {
                slug: true,
              },
            },
          },
        },
      },
    }),
    prisma.setting.findMany({
      where: includeSensitive
        ? undefined
        : { editable: true, secret: false },
      orderBy: { key: 'asc' },
      select: {
        key: true,
        value: true,
        group: true,
        editable: true,
        secret: true,
        description: true,
      },
    }),
  ])

  return {
    meta: {
      format: 'papergrid-backup',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      includeSensitive,
    },
    counts: {
      categories: categories.length,
      tags: tags.length,
      projects: projects.length,
      posts: posts.length,
      settings: settings.length,
    },
    data: {
      categories: categories.map((item) => ({
        name: item.name,
        slug: item.slug,
        description: item.description,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      tags: tags.map((item) => ({
        name: item.name,
        slug: item.slug,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      projects: projects.map((item) => ({
        name: item.name,
        url: item.url,
        description: item.description,
        image: item.image,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      posts: posts.map((item) => ({
        title: item.title,
        slug: item.slug,
        content: item.content,
        excerpt: item.excerpt,
        coverImage: item.coverImage,
        status: item.status,
        locale: item.locale,
        publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        isProtected: item.isProtected,
        ...(includeSensitive ? { passwordHash: item.passwordHash } : {}),
        categorySlug: item.category?.slug || null,
        tagSlugs: item.postTags.map((pt) => pt.tag.slug),
      })),
      settings: settings.map((item) => ({
        key: item.key,
        value: item.value,
        group: item.group,
        editable: item.editable,
        secret: item.secret,
        description: item.description,
      })),
    },
  }
}

export function parseBackupPayload(raw: unknown) {
  const dataNode = getDataNode(raw)
  if (!dataNode) {
    throw new Error('导入数据格式错误，缺少 data 节点')
  }

  return {
    categories: toRecordArray(dataNode.categories),
    tags: toRecordArray(dataNode.tags),
    projects: toRecordArray(dataNode.projects),
    posts: toRecordArray(dataNode.posts),
    settings: toRecordArray(dataNode.settings),
  }
}

export async function importBackupData(input: {
  payload: unknown
  includeSensitive: boolean
  userId: string
}) {
  const { includeSensitive, payload, userId } = input
  const parsed = parseBackupPayload(payload)
  const summary = createSummary()
  const categoryIdBySlug = new Map<string, string>()
  const tagIdBySlug = new Map<string, string>()
  const categorySlugs = Array.from(new Set(
    parsed.categories
      .map((item) => pickString(item.slug, 120))
      .filter((slug): slug is string => Boolean(slug))
  ))
  const tagSlugs = Array.from(new Set(
    parsed.tags
      .map((item) => pickString(item.slug, 120))
      .filter((slug): slug is string => Boolean(slug))
  ))
  const projectUrls = Array.from(new Set(
    parsed.projects
      .map((item) => pickString(item.url, 1200))
      .filter((url): url is string => Boolean(url))
  ))
  const settingKeys = Array.from(new Set(
    parsed.settings
      .map((item) => pickString(item.key, 200))
      .filter((key): key is string => Boolean(key))
  ))
  const postSlugs = Array.from(new Set(
    parsed.posts
      .map((item) => pickString(item.slug, 180))
      .filter((slug): slug is string => Boolean(slug))
  ))

  const existingCategoriesPromise = categorySlugs.length > 0
    ? prisma.category.findMany({
      where: { slug: { in: categorySlugs } },
      select: { id: true, slug: true },
    })
    : Promise.resolve([] as Array<{ id: string; slug: string }>)
  const existingTagsPromise = tagSlugs.length > 0
    ? prisma.tag.findMany({
      where: { slug: { in: tagSlugs } },
      select: { id: true, slug: true },
    })
    : Promise.resolve([] as Array<{ id: string; slug: string }>)
  const existingProjectsPromise = projectUrls.length > 0
    ? prisma.project.findMany({
      where: { url: { in: projectUrls } },
      select: { id: true, url: true },
    })
    : Promise.resolve([] as Array<{ id: string; url: string }>)
  const existingSettingsPromise = settingKeys.length > 0
    ? prisma.setting.findMany({
      where: { key: { in: settingKeys } },
      select: {
        id: true,
        key: true,
        editable: true,
        secret: true,
      },
    })
    : Promise.resolve([] as ExistingSettingSnapshot[])
  const existingPostsPromise = postSlugs.length > 0
    ? prisma.post.findMany({
      where: { slug: { in: postSlugs } },
      select: {
        id: true,
        slug: true,
        passwordHash: true,
        publishedAt: true,
      },
    })
    : Promise.resolve([] as ExistingPostSnapshot[])

  const [existingCategories, existingTags, existingProjects, existingSettings, existingPosts] = await Promise.all([
    existingCategoriesPromise,
    existingTagsPromise,
    existingProjectsPromise,
    existingSettingsPromise,
    existingPostsPromise,
  ])

  for (const category of existingCategories) {
    categoryIdBySlug.set(category.slug, category.id)
  }
  for (const tag of existingTags) {
    tagIdBySlug.set(tag.slug, tag.id)
  }

  const projectIdByUrl = new Map<string, string>()
  for (const project of existingProjects) {
    if (!projectIdByUrl.has(project.url)) {
      projectIdByUrl.set(project.url, project.id)
    }
  }

  const existingSettingByKey = new Map<string, ExistingSettingSnapshot>(
    existingSettings.map((setting) => [setting.key, setting])
  )

  const existingPostBySlug = new Map<string, ExistingPostSnapshot>(
    existingPosts.map((post) => [post.slug, post])
  )

  for (const item of parsed.categories) {
    const slug = pickString(item.slug, 120)
    const name = pickString(item.name, 120)
    const description = pickLongString(item.description, 4000)
    const createdAt = pickDate(item.createdAt)
    const updatedAt = pickDate(item.updatedAt)

    if (!slug || !name) {
      summary.categories.skipped += 1
      pushWarning(summary, '存在分类记录缺少 name 或 slug，已跳过')
      continue
    }

    try {
      const existingId = categoryIdBySlug.get(slug)

      if (existingId) {
        await prisma.category.update({
          where: { id: existingId },
          data: {
            name,
            description,
            ...(updatedAt ? { updatedAt } : {}),
          },
        })
        summary.categories.updated += 1
        continue
      }

      const created = await prisma.category.create({
        data: {
          slug,
          name,
          description,
          ...(createdAt ? { createdAt } : {}),
          ...(updatedAt ? { updatedAt } : {}),
        },
        select: { id: true },
      })
      summary.categories.created += 1
      categoryIdBySlug.set(slug, created.id)
    } catch (error) {
      console.error('导入分类失败:', error)
      summary.categories.skipped += 1
      pushWarning(summary, `分类 "${slug}" 导入失败`)
    }
  }

  for (const item of parsed.tags) {
    const slug = pickString(item.slug, 120)
    const name = pickString(item.name, 120)
    const createdAt = pickDate(item.createdAt)
    const updatedAt = pickDate(item.updatedAt)

    if (!slug || !name) {
      summary.tags.skipped += 1
      pushWarning(summary, '存在标签记录缺少 name 或 slug，已跳过')
      continue
    }

    try {
      const existingId = tagIdBySlug.get(slug)

      if (existingId) {
        await prisma.tag.update({
          where: { id: existingId },
          data: {
            name,
            ...(updatedAt ? { updatedAt } : {}),
          },
        })
        summary.tags.updated += 1
        continue
      }

      const created = await prisma.tag.create({
        data: {
          slug,
          name,
          ...(createdAt ? { createdAt } : {}),
          ...(updatedAt ? { updatedAt } : {}),
        },
        select: { id: true },
      })
      summary.tags.created += 1
      tagIdBySlug.set(slug, created.id)
    } catch (error) {
      console.error('导入标签失败:', error)
      summary.tags.skipped += 1
      pushWarning(summary, `标签 "${slug}" 导入失败`)
    }
  }

  for (const item of parsed.projects) {
    const name = pickString(item.name, 200)
    const url = pickString(item.url, 1200)
    const description = pickLongString(item.description, 4000)
    const image = pickLongString(item.image, 2000)
    const createdAt = pickDate(item.createdAt)
    const updatedAt = pickDate(item.updatedAt)

    if (!name || !url) {
      summary.projects.skipped += 1
      pushWarning(summary, '存在作品记录缺少 name 或 url，已跳过')
      continue
    }

    try {
      const existingId = projectIdByUrl.get(url)

      if (existingId) {
        await prisma.project.update({
          where: { id: existingId },
          data: {
            name,
            description,
            image,
            ...(updatedAt ? { updatedAt } : {}),
          },
        })
        summary.projects.updated += 1
        continue
      }

      const created = await prisma.project.create({
        data: {
          name,
          url,
          description,
          image,
          ...(createdAt ? { createdAt } : {}),
          ...(updatedAt ? { updatedAt } : {}),
        },
        select: { id: true },
      })
      summary.projects.created += 1
      projectIdByUrl.set(url, created.id)
    } catch (error) {
      console.error('导入作品失败:', error)
      summary.projects.skipped += 1
      pushWarning(summary, `作品 "${name}" 导入失败`)
    }
  }

  for (const item of parsed.settings) {
    const key = pickString(item.key, 200)
    const group = pickString(item.group, 100) || 'site'
    const description = pickLongString(item.description, 4000)
    const editable = item.editable !== false
    const secret = item.secret === true

    if (!key) {
      summary.settings.skipped += 1
      pushWarning(summary, '存在设置记录缺少 key，已跳过')
      continue
    }

    if (secret && !includeSensitive) {
      summary.settings.skipped += 1
      pushWarning(summary, `设置 "${key}" 属于敏感项，未启用敏感导入，已跳过`)
      continue
    }

    try {
      const existing = existingSettingByKey.get(key)

      if (existing) {
        if (!existing.editable) {
          if (!existing.secret) {
            summary.settings.skipped += 1
            pushWarning(summary, `设置 "${key}" 为只读系统项，已跳过`)
            continue
          }
          if (!includeSensitive) {
            summary.settings.skipped += 1
            pushWarning(summary, `设置 "${key}" 为只读敏感项，未启用敏感导入，已跳过`)
            continue
          }
        }

        if (existing.secret && !includeSensitive) {
          summary.settings.skipped += 1
          pushWarning(summary, `设置 "${key}" 为敏感项，未启用敏感导入，已跳过`)
          continue
        }

        await prisma.setting.update({
          where: { id: existing.id },
          data: {
            value: toJsonValue(item.value),
            group,
            description,
          },
        })
        summary.settings.updated += 1
        continue
      }

      const created = await prisma.setting.create({
        data: {
          key,
          value: toJsonValue(item.value),
          group,
          description,
          editable,
          secret: includeSensitive ? secret : false,
        },
        select: {
          id: true,
          key: true,
          editable: true,
          secret: true,
        },
      })
      summary.settings.created += 1
      existingSettingByKey.set(created.key, created)
    } catch (error) {
      console.error('导入设置失败:', error)
      summary.settings.skipped += 1
      pushWarning(summary, `设置 "${key}" 导入失败`)
    }
  }

  const categorySlugsFromPosts = Array.from(new Set(
    parsed.posts
      .map((item) => pickString(item.categorySlug, 120))
      .filter((slug): slug is string => Boolean(slug))
  ))
  const missingCategorySlugs = categorySlugsFromPosts.filter((slug) => !categoryIdBySlug.has(slug))
  if (missingCategorySlugs.length > 0) {
    const postCategories = await prisma.category.findMany({
      where: { slug: { in: missingCategorySlugs } },
      select: { id: true, slug: true },
    })
    for (const category of postCategories) {
      categoryIdBySlug.set(category.slug, category.id)
    }
  }

  const postTagSlugs = new Set<string>()
  for (const item of parsed.posts) {
    for (const slug of toStringArray(item.tagSlugs, 120)) {
      postTagSlugs.add(slug)
    }
  }
  const missingTagSlugs = Array.from(postTagSlugs).filter((slug) => !tagIdBySlug.has(slug))
  if (missingTagSlugs.length > 0) {
    const postTags = await prisma.tag.findMany({
      where: { slug: { in: missingTagSlugs } },
      select: { id: true, slug: true },
    })
    for (const tag of postTags) {
      tagIdBySlug.set(tag.slug, tag.id)
    }
  }

  for (const item of parsed.posts) {
    const slug = pickString(item.slug, 180)
    const title = pickString(item.title, 300)
    const content = pickRawString(item.content)

    if (!slug || !title || !content) {
      summary.posts.skipped += 1
      pushWarning(summary, '存在文章记录缺少 slug/title/content，已跳过')
      continue
    }

    const excerpt = pickLongString(item.excerpt, 12000)
    const coverImage = pickLongString(item.coverImage, 2000)
    const status = normalizePostStatus(item.status)
    const locale = normalizeLocale(item.locale)
    const createdAt = pickDate(item.createdAt)
    const updatedAt = pickDate(item.updatedAt)
    const publishedAt = pickDate(item.publishedAt)
    const categorySlug = pickString(item.categorySlug, 120)
    const tagSlugsInPost = toStringArray(item.tagSlugs, 120)
    const wantsProtected = item.isProtected === true
    const rawImportedPasswordHash = includeSensitive
      ? pickLongString(item.passwordHash, 255)
      : null
    const importedPasswordHash = rawImportedPasswordHash && isBcryptHash(rawImportedPasswordHash)
      ? rawImportedPasswordHash
      : null
    const hasInvalidImportedPasswordHash =
      includeSensitive && Boolean(rawImportedPasswordHash) && !importedPasswordHash

    try {
      let categoryId: string | null = null

      if (categorySlug) {
        let cachedId = categoryIdBySlug.get(categorySlug)
        if (!cachedId) {
          const createdCategory = await prisma.category.create({
            data: {
              slug: categorySlug,
              name: toDisplayNameFromSlug(categorySlug),
            },
            select: { id: true },
          })
          cachedId = createdCategory.id
          categoryIdBySlug.set(categorySlug, createdCategory.id)
          summary.autoCreatedFromPosts.categories += 1
        }
        categoryId = cachedId
      }

      const tagIds: string[] = []
      for (const tagSlug of tagSlugsInPost) {
        let tagId = tagIdBySlug.get(tagSlug)
        if (!tagId) {
          const createdTag = await prisma.tag.create({
            data: {
              slug: tagSlug,
              name: toDisplayNameFromSlug(tagSlug),
            },
            select: { id: true },
          })
          tagId = createdTag.id
          tagIdBySlug.set(tagSlug, createdTag.id)
          summary.autoCreatedFromPosts.tags += 1
        }

        tagIds.push(tagId)
      }

      const uniqueTagIds = Array.from(new Set(tagIds))
      const existingPost = existingPostBySlug.get(slug) || null

      let isProtected = false
      let passwordHash: string | null = null

      if (wantsProtected) {
        if (importedPasswordHash) {
          isProtected = true
          passwordHash = importedPasswordHash
        } else if (existingPost?.passwordHash) {
          isProtected = true
          passwordHash = existingPost.passwordHash
          pushWarning(
            summary,
            hasInvalidImportedPasswordHash
              ? `文章 "${slug}" 提供的密码哈希格式不合法，已忽略并保留当前密码`
              : `文章 "${slug}" 未提供密码哈希，已保留当前密码`
          )
        } else {
          pushWarning(
            summary,
            hasInvalidImportedPasswordHash
              ? `文章 "${slug}" 提供的密码哈希格式不合法，已忽略并改为不加密`
              : `文章 "${slug}" 标记为加密但缺少密码哈希，已改为不加密`
          )
        }
      }

      const nextPublishedAt = status === PostStatus.PUBLISHED
        ? (publishedAt || existingPost?.publishedAt || new Date())
        : null

      if (existingPost) {
        await prisma.post.update({
          where: { id: existingPost.id },
          data: {
            title,
            content,
            excerpt,
            coverImage,
            status,
            locale,
            categoryId,
            isProtected,
            passwordHash,
            readingTime: Math.max(1, Math.round(readingTime(content).minutes)),
            publishedAt: nextPublishedAt,
            ...(createdAt ? { createdAt } : {}),
            ...(updatedAt ? { updatedAt } : {}),
            postTags: {
              deleteMany: {},
              create: uniqueTagIds.map((tagId) => ({ tagId })),
            },
          },
        })
        summary.posts.updated += 1
        existingPostBySlug.set(slug, {
          id: existingPost.id,
          slug,
          passwordHash,
          publishedAt: nextPublishedAt,
        })
      } else {
        const created = await prisma.post.create({
          data: {
            title,
            slug,
            content,
            excerpt,
            coverImage,
            status,
            locale,
            categoryId,
            authorId: userId,
            isProtected,
            passwordHash,
            readingTime: Math.max(1, Math.round(readingTime(content).minutes)),
            publishedAt: nextPublishedAt,
            ...(createdAt ? { createdAt } : {}),
            ...(updatedAt ? { updatedAt } : {}),
            postTags: {
              create: uniqueTagIds.map((tagId) => ({ tagId })),
            },
          },
          select: { id: true },
        })
        summary.posts.created += 1
        existingPostBySlug.set(slug, {
          id: created.id,
          slug,
          passwordHash,
          publishedAt: nextPublishedAt,
        })
      }
    } catch (error) {
      console.error('导入文章失败:', error)
      summary.posts.skipped += 1
      pushWarning(summary, `文章 "${slug}" 导入失败`)
    }
  }

  return {
    summary,
    importedCounts: {
      categories: parsed.categories.length,
      tags: parsed.tags.length,
      projects: parsed.projects.length,
      posts: parsed.posts.length,
      settings: parsed.settings.length,
    },
  }
}

export function parseBooleanFlag(input: string | null | undefined) {
  return toBooleanFlag(input)
}
