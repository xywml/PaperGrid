import { revalidatePath, revalidateTag } from 'next/cache'
import {
  ALL_SETTINGS_CACHE_TAG,
  PUBLIC_SETTING_KEYS,
  POST_PAGE_SETTING_KEYS,
  getSettingCacheTag,
} from './settings'

const LAYOUT_SETTING_KEYS = new Set<string>([
  ...PUBLIC_SETTING_KEYS,
  'site.defaultTheme',
  'site.customHeadCode',
])

const POST_PAGE_REVALIDATE_KEYS = new Set<string>(POST_PAGE_SETTING_KEYS)

function hasAnyKey(source: Set<string>, targets: Set<string>) {
  for (const key of source) {
    if (targets.has(key)) {
      return true
    }
  }
  return false
}

export function revalidateForUpdatedSettings(keys: Iterable<string>) {
  const updatedKeys = new Set(Array.from(keys, (key) => key.trim()).filter(Boolean))

  if (updatedKeys.size === 0) {
    return
  }

  for (const key of updatedKeys) {
    revalidateTag(getSettingCacheTag(key), 'max')
  }

  if (hasAnyKey(updatedKeys, LAYOUT_SETTING_KEYS)) {
    revalidatePath('/', 'layout')
  }

  if (hasAnyKey(updatedKeys, POST_PAGE_REVALIDATE_KEYS)) {
    revalidatePath('/posts/[slug]', 'page')
  }

  if (updatedKeys.has('comments.enabled')) {
    revalidatePath('/', 'page')
  }
}

export function revalidateAllPublicSettings() {
  revalidateTag(ALL_SETTINGS_CACHE_TAG, 'max')
  revalidatePath('/', 'layout')
  revalidatePath('/', 'page')
  revalidatePath('/about', 'page')
  revalidatePath('/posts/[slug]', 'page')
}
