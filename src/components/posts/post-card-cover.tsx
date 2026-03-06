import Image from 'next/image'
import { isInternalImageUrl } from '@/lib/image-url'

interface PostCardCoverProps {
  coverImage: string
  title: string
  sizes?: string
  priority?: boolean
}

export function PostCardCover({ coverImage, title, sizes = '100vw', priority = false }: PostCardCoverProps) {
  return (
    <>
      <div className="absolute inset-0 z-0 overflow-hidden">
        {isInternalImageUrl(coverImage) ? (
          <Image
            src={coverImage}
            alt={title}
            fill
            sizes={sizes}
            priority={priority}
            className="h-full w-full object-cover object-center"
          />
        ) : (
          <img
            src={coverImage}
            alt={title}
            className="h-full w-full object-cover object-center"
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
          />
        )}
      </div>
      <div
        className="pointer-events-none absolute inset-0 z-[1] bg-white/12 dark:bg-slate-950/28"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(255,255,255,0.86)_0%,rgba(255,255,255,0.52)_30%,rgba(255,255,255,0.16)_62%,rgba(255,255,255,0.74)_100%)] dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.82)_0%,rgba(2,6,23,0.46)_34%,rgba(2,6,23,0.18)_62%,rgba(2,6,23,0.8)_100%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.9)_26%,rgba(255,255,255,0.62)_48%,rgba(255,255,255,0.18)_78%,transparent_100%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(2,6,23,0.96)_0%,rgba(2,6,23,0.9)_28%,rgba(2,6,23,0.62)_52%,rgba(2,6,23,0.16)_80%,transparent_100%)]"
        aria-hidden="true"
      />
    </>
  )
}
