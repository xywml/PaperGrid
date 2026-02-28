import { cache } from 'react'
import { prisma } from './prisma'

const SETTING_VALUE_FIELD_BY_KEY: Record<string, string> = {
  'ui.publicStylePreset': 'preset',
  'ui.mobileReadingBackground': 'style',
}

const COMMON_SETTING_FIELDS = ['value', 'text', 'enabled', 'style', 'preset'] as const

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

const getSettingRecord = cache(async (key: string) => {
  return prisma.setting.findUnique({
    where: { key },
  })
})

const PUBLIC_SETTING_KEYS = [
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
]

const getPublicSettingsCached = cache(async () => {
  const settings = await prisma.setting.findMany({
    where: {
      key: { in: PUBLIC_SETTING_KEYS },
    },
  })

  const result: Record<string, unknown> = {}
  for (const s of settings) {
    result[s.key] = unwrapSettingValue(s.key, s.value)
  }

  return result
})

export async function getSetting<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined> {
  const setting = await getSettingRecord(key)
  
  if (!setting || !setting.value) {
    return defaultValue
  }

  const value = unwrapSettingValue(key, setting.value)
  return (value ?? defaultValue) as T
}

export async function getPublicSettings() {
  return getPublicSettingsCached()
}
