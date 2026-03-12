import { unstable_cache } from 'next/cache'
import { prisma } from './prisma'

const SETTING_VALUE_FIELD_BY_KEY: Record<string, string> = {
  'ui.publicStylePreset': 'preset',
  'ui.mobileReadingBackground': 'style',
  'site.customHeadCode': 'text',
}

const COMMON_SETTING_FIELDS = ['value', 'text', 'enabled', 'style', 'preset'] as const

const SETTING_CACHE_TAG_PREFIX = 'setting:'

export const ALL_SETTINGS_CACHE_TAG = 'setting:all'

function unwrapSettingValue(key: string, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const preferredField = SETTING_VALUE_FIELD_BY_KEY[key]
  if (preferredField && preferredField in record) {
    return record[preferredField]
  }
  for (const field of COMMON_SETTING_FIELDS) {
    if (field in record) {
      return record[field]
    }
  }
  const entries = Object.entries(record)
  return entries.length === 1 ? entries[0][1] : undefined
}

function normalizeSettingKeys(keys: Iterable<string>) {
  return Array.from(new Set(Array.from(keys, (key) => key.trim()).filter(Boolean))).sort()
}

export function getSettingCacheTag(key: string) {
  return `${SETTING_CACHE_TAG_PREFIX}${key}`
}

export const PUBLIC_SETTING_KEYS = [
  'site.title',
  'site.description',
  'site.ownerName',
  'site.logoUrl',
  'site.faviconUrl',
  'site.defaultAvatarUrl',
  'ui.hideAdminEntry',
  'ui.publicStylePreset',
  'hero.typingTitles',
  'hero.subtitle',
  'hero.location',
  'profile.tagline',
  'profile.signature',
  'profile.role',
  'profile.location',
  'profile.joinedYear',
  'profile.bio',
  'profile.techStack',
  'profile.hobbies',
  'profile.contactIntro',
  'profile.contactEmail',
  'profile.contactGithub',
  'profile.contactX',
  'profile.contactBilibili',
  'profile.contactQQ',
  'profile.social.github.enabled',
  'profile.social.x.enabled',
  'profile.social.bilibili.enabled',
  'profile.social.email.enabled',
  'profile.social.qq.enabled',
  'site.footer_icp',
  'site.footer_mps',
  'site.footer_copyright',
  'site.footer_powered_by',
] as const

export const POST_PAGE_SETTING_KEYS = [
  'comments.enabled',
  'comments.allowGuest',
  'site.ownerName',
  'site.defaultAvatarUrl',
  'profile.role',
  'ui.mobileReadingBackground',
] as const

async function getSettingsSnapshot(keys: readonly string[]) {
  const normalizedKeys = normalizeSettingKeys(keys)
  if (normalizedKeys.length === 0) {
    return {} as Record<string, unknown>
  }

  return unstable_cache(
    async () => {
      const settings = await prisma.setting.findMany({
        where: {
          key: { in: normalizedKeys },
        },
      })

      const result: Record<string, unknown> = {}
      for (const s of settings) {
        result[s.key] = unwrapSettingValue(s.key, s.value)
      }

      return result
    },
    ['settings-snapshot', ...normalizedKeys],
    {
      tags: [ALL_SETTINGS_CACHE_TAG, ...normalizedKeys.map(getSettingCacheTag)],
      revalidate: false,
    }
  )()
}

export type PostPageSettings = {
  commentsEnabled: boolean
  allowGuest: boolean
  ownerName: string
  defaultAvatarUrl: string
  ownerRole: string
  mobileReadingBackground: string
}

export async function getSetting<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined> {
  const normalizedKey = key.trim()
  if (!normalizedKey) {
    return defaultValue
  }

  const settings = await getSettingsSnapshot([normalizedKey])
  return (settings[normalizedKey] ?? defaultValue) as T
}

export async function getPublicSettings() {
  return getSettingsSnapshot(PUBLIC_SETTING_KEYS)
}

export async function getPostPageSettings(): Promise<PostPageSettings> {
  const settings = await getSettingsSnapshot(POST_PAGE_SETTING_KEYS)

  return {
    commentsEnabled: (settings['comments.enabled'] as boolean | undefined) ?? true,
    allowGuest: (settings['comments.allowGuest'] as boolean | undefined) ?? false,
    ownerName: (settings['site.ownerName'] as string | undefined) || '千叶',
    defaultAvatarUrl: (settings['site.defaultAvatarUrl'] as string | undefined) || '',
    ownerRole: (settings['profile.role'] as string | undefined) || '全栈开发者',
    mobileReadingBackground:
      (settings['ui.mobileReadingBackground'] as string | undefined) || 'grid',
  }
}
