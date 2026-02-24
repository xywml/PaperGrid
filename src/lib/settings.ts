import { cache } from 'react'
import { prisma } from './prisma'

function unwrapSettingValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined
  const values = Object.values(value as Record<string, unknown>)
  return values.length > 0 ? values[0] : undefined
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
    result[s.key] = unwrapSettingValue(s.value)
  }

  return result
})

export async function getSetting<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined> {
  const setting = await getSettingRecord(key)
  
  if (!setting || !setting.value) {
    return defaultValue
  }

  const value = unwrapSettingValue(setting.value)
  return (value ?? defaultValue) as T
}

export async function getPublicSettings() {
  return getPublicSettingsCached()
}
