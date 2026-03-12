import { revalidatePath, revalidateTag } from 'next/cache'
import {
  POSTS_CONTENT_CACHE_TAG,
  POSTS_LIST_CACHE_TAG,
  POSTS_ORDER_CACHE_TAG,
  getCategoryRelatedCacheTag,
  getPostCacheTag,
} from './public-post-page'

const PUBLIC_POST_LIST_PATHS = ['/', '/posts', '/archive', '/categories', '/tags'] as const

type RevalidatePostLike = {
  slug?: string | null
  category?: {
    slug?: string | null
  } | null
  postTags?:
    | Array<{
        tag?: {
          slug?: string | null
        } | null
      }>
    | null
}

function normalizeSlug(slug: string | null | undefined) {
  return typeof slug === 'string' ? slug.trim() : ''
}

function revalidateCommonPublicPostPaths() {
  for (const path of PUBLIC_POST_LIST_PATHS) {
    revalidatePath(path)
  }
  revalidatePath('/posts/[slug]', 'page')
}

export function revalidatePublicPostPaths(...posts: Array<RevalidatePostLike | null | undefined>) {
  const paths = new Set<string>(PUBLIC_POST_LIST_PATHS)
  const tags = new Set<string>([POSTS_LIST_CACHE_TAG, POSTS_ORDER_CACHE_TAG])
  let shouldRevalidatePostPages = false

  for (const post of posts) {
    if (!post) continue
    shouldRevalidatePostPages = true

    const postSlug = normalizeSlug(post.slug)
    if (postSlug) {
      paths.add(`/posts/${postSlug}`)
      tags.add(getPostCacheTag(postSlug))
    }

    const categorySlug = normalizeSlug(post.category?.slug)
    if (categorySlug) {
      paths.add(`/categories/${categorySlug}`)
      tags.add(getCategoryRelatedCacheTag(categorySlug))
    }

    for (const item of post.postTags || []) {
      const tagSlug = normalizeSlug(item?.tag?.slug)
      if (tagSlug) {
        paths.add(`/tags/${tagSlug}`)
      }
    }
  }

  for (const path of paths) {
    revalidatePath(path)
  }

  if (shouldRevalidatePostPages) {
    revalidatePath('/posts/[slug]', 'page')
  }

  for (const tag of tags) {
    revalidateTag(tag, 'max')
  }
}

export function revalidateAllPublicPostContent() {
  revalidateCommonPublicPostPaths()
  revalidatePath('/categories/[slug]', 'page')
  revalidatePath('/tags/[slug]', 'page')
  revalidateTag(POSTS_CONTENT_CACHE_TAG, 'max')
  revalidateTag(POSTS_LIST_CACHE_TAG, 'max')
  revalidateTag(POSTS_ORDER_CACHE_TAG, 'max')
}

export function revalidatePublicTaxonomyPaths(input?: {
  categorySlugs?: Iterable<string>
  tagSlugs?: Iterable<string>
}) {
  revalidateAllPublicPostContent()

  for (const slug of input?.categorySlugs || []) {
    const normalizedSlug = normalizeSlug(slug)
    if (normalizedSlug) {
      revalidatePath(`/categories/${normalizedSlug}`)
    }
  }

  for (const slug of input?.tagSlugs || []) {
    const normalizedSlug = normalizeSlug(slug)
    if (normalizedSlug) {
      revalidatePath(`/tags/${normalizedSlug}`)
    }
  }
}
