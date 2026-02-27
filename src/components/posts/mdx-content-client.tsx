'use client'

import { Children, ComponentProps, isValidElement, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypePrismPlus from 'rehype-prism-plus'
import { mdxComponents } from '@/components/mdx/mdx-components.client'
import { Mermaid } from './mermaid'
import { CodeCopyButton } from './code-copy-button'
import { cn } from '@/lib/utils'

interface MDXContentClientProps {
  content: string
}

type MarkdownCodeProps = ComponentProps<'code'> & {
  inline?: boolean
  node?: unknown
}

const sanitizeSchema = {
  ...defaultSchema,
  clobberPrefix: '',
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'div',
    'span',
    'details',
    'summary',
    'kbd',
    'mark',
    'section',
    'sup',
    'sub',
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': ['id'],
    div: ['className', 'class'],
    span: ['className', 'class'],
    code: ['className', 'class'],
    pre: ['className', 'class'],
    a: ['href', 'title', 'rel', 'target', 'id', 'aria-describedby'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
    sup: ['id'],
    li: ['id'],
    ol: ['id'],
    ul: ['id'],
    section: ['id'],
    h1: ['id'],
    h2: ['id'],
    h3: ['id'],
    h4: ['id'],
  },
}

function extractTextFromReact(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractTextFromReact).join('')
  if (isValidElement(node)) {
    return extractTextFromReact((node as { props?: { children?: unknown } }).props?.children)
  }
  return ''
}

export function MDXContentClient({ content }: MDXContentClientProps) {
  let headingIndex = 0

  const HeadingH1 = ({ className, ...props }: ComponentProps<'h1'>) => (
    <h1
      id={`heading-${headingIndex++}`}
      className={cn('text-3xl font-bold mt-8 mb-4 border-b pb-2', className)}
      {...props}
    />
  )

  const HeadingH2 = ({ className, ...props }: ComponentProps<'h2'>) => (
    <h2
      id={`heading-${headingIndex++}`}
      className={cn('text-2xl font-bold mt-8 mb-4 border-b pb-1', className)}
      {...props}
    />
  )

  const HeadingH3 = ({ className, ...props }: ComponentProps<'h3'>) => (
    <h3
      id={`heading-${headingIndex++}`}
      className={cn('text-xl font-bold mt-6 mb-3', className)}
      {...props}
    />
  )

  return (
    <div className="mdx-content max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, sanitizeSchema],
          [rehypeKatex, { strict: 'ignore' }],
          [rehypePrismPlus, { ignoreMissing: true }],
        ]}
        components={{
          ...mdxComponents,
          h1: HeadingH1,
          h2: HeadingH2,
          h3: HeadingH3,
          pre({ children }) {
            const child = Array.isArray(children) ? children[0] : children
            if (isValidElement(child)) {
              const childProps = child.props as { className?: string; children?: unknown }
              const className = childProps.className || ''
              const match = /language-(\w+)/.exec(className)
              const language = match ? match[1] : ''
              const rawCode = extractTextFromReact(childProps.children)
              const code = rawCode.replace(/\n$/, '')

              if (language === 'mermaid') {
                return <Mermaid content={code} />
              }

              const renderedChildren = (childProps.children as ReactNode | undefined) ?? code

              return (
                <div
                  data-code-block
                  className="group relative my-4 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 bg-[#f8f9fa] dark:bg-[#1e1e1e]"
                >
                  <div className="absolute right-3 top-2 flex items-center gap-3 opacity-30 group-hover:opacity-100 transition-opacity z-10">
                    <span className="text-[10px] font-mono tracking-widest text-gray-500 dark:text-gray-400 uppercase">
                      {language || 'code'}
                    </span>
                    <CodeCopyButton />
                  </div>

                  <pre className="overflow-x-auto p-4 pt-5 text-[13px] leading-normal sm:text-[14px]">
                    <code className={className}>{renderedChildren}</code>
                  </pre>
                </div>
              )
            }

            return <pre>{children}</pre>
          },
          code({ className, children, ...props }: MarkdownCodeProps) {
            return (
              <code
                className={cn(
                  'mx-1 rounded-md bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[0.85em] font-mono text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 font-medium',
                  className
                )}
                {...props}
              >
                {children}
              </code>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
