'use client'

import { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const mdxComponents = {
  h1: ({ className, ...props }: ComponentProps<'h1'>) => (
    <h1 className={cn('text-3xl font-bold mt-8 mb-4 border-b pb-2', className)} {...props} />
  ),
  h2: ({ className, ...props }: ComponentProps<'h2'>) => (
    <h2 className={cn('text-2xl font-bold mt-8 mb-4 border-b pb-1', className)} {...props} />
  ),
  h3: ({ className, ...props }: ComponentProps<'h3'>) => (
    <h3 className={cn('text-xl font-bold mt-6 mb-3', className)} {...props} />
  ),
  h4: ({ className, ...props }: ComponentProps<'h4'>) => (
    <h4 className={cn('text-lg font-bold mt-4 mb-2', className)} {...props} />
  ),
  p: ({ className, ...props }: ComponentProps<'p'>) => (
    <p className={cn('my-3 leading-relaxed text-[15px] sm:text-base text-gray-800 dark:text-gray-200', className)} {...props} />
  ),
  a: ({ className, ...props }: ComponentProps<'a'>) => (
    <a className={cn('text-blue-600 hover:underline dark:text-blue-400 font-medium', className)} {...props} />
  ),
  ul: ({ className, ...props }: ComponentProps<'ul'>) => (
    <ul className={cn('list-disc pl-6 my-3 space-y-1.5 text-[15px] sm:text-base', className)} {...props} />
  ),
  ol: ({ className, ...props }: ComponentProps<'ol'>) => (
    <ol className={cn('list-decimal pl-6 my-3 space-y-1.5 text-[15px] sm:text-base', className)} {...props} />
  ),
  li: ({ className, ...props }: ComponentProps<'li'>) => (
    <li className={cn('my-0.5', className)} {...props} />
  ),
  blockquote: ({ className, ...props }: ComponentProps<'blockquote'>) => (
    <blockquote
      className={cn(
        'border-l-4 border-gray-300 pl-4 italic text-gray-700 dark:border-gray-600 dark:text-gray-300 my-4',
        className
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }: ComponentProps<'hr'>) => (
    <hr className={cn('my-8 border-gray-200 dark:border-gray-700', className)} {...props} />
  ),
  table: ({ className, ...props }: ComponentProps<'table'>) => (
    <div className="my-6 w-full overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  ),
  thead: ({ className, ...props }: ComponentProps<'thead'>) => (
    <thead className={cn('bg-gray-100 dark:bg-gray-800/50', className)} {...props} />
  ),
  tbody: ({ className, ...props }: ComponentProps<'tbody'>) => (
    <tbody className={cn('divide-y divide-gray-200 dark:divide-gray-800', className)} {...props} />
  ),
  tr: ({ className, ...props }: ComponentProps<'tr'>) => (
    <tr className={cn('hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors', className)} {...props} />
  ),
  th: ({ className, ...props }: ComponentProps<'th'>) => (
    <th className={cn('px-4 py-3 text-left font-bold text-gray-900 dark:text-white', className)} {...props} />
  ),
  td: ({ className, ...props }: ComponentProps<'td'>) => (
    <td className={cn('px-4 py-3 text-gray-700 dark:text-gray-300', className)} {...props} />
  ),
  img: ({ className, src, alt, ...props }: ComponentProps<'img'>) => {
    const safeSrc = typeof src === 'string' ? src : ''
    return (
      <img
        src={safeSrc}
        alt={alt || ''}
        loading="lazy"
        decoding="async"
        className={cn('rounded-lg my-4 h-auto w-full object-cover', className)}
        {...props}
      />
    )
  },
}
