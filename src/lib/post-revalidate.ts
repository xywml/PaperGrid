import { revalidatePath } from 'next/cache'

const PUBLIC_POST_LIST_PATHS = ['/', '/posts', '/archive', '/categories', '/tags'] as const

export function revalidatePublicPostPaths(slug?: string | null) {
  for (const path of PUBLIC_POST_LIST_PATHS) {
    revalidatePath(path)
  }

  if (slug) {
    revalidatePath(`/posts/${slug}`)
  }
}
