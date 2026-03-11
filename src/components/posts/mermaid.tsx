'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog'
import { normalizeMermaidForCompatibility } from '@/lib/mermaid-compat'

interface MermaidProps {
  content: string
}

type MermaidLike = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, text: string) => Promise<{ svg: string }>
}

export function Mermaid({ content }: MermaidProps) {
  const ref = useRef<HTMLDivElement>(null)
  const mermaidRef = useRef<MermaidLike | null>(null)
  const [hasError, setHasError] = useState(false)
  const [svgCode, setSvgCode] = useState<string>('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const mod = await import('mermaid')
        if (cancelled) return
        const m =
          (mod as unknown as { default?: MermaidLike }).default ?? (mod as unknown as MermaidLike)
        mermaidRef.current = m
        m.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          fontFamily: 'inherit',
          flowchart: {
            htmlLabels: true,
            useMaxWidth: true,
          },
        })
        setReady(true)
      } catch (err) {
        console.error('Mermaid load error:', err)
        setHasError(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const mermaid = mermaidRef.current
    if (!mermaid) return

    if (ref.current && content) {
      let cancelled = false
      const renderDiagram = async (source: string) => {
        const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`
        return mermaid.render(id, source)
      }

      try {
        setHasError(false)
        const normalizedContent = normalizeMermaidForCompatibility(content)

        renderDiagram(content)
          .catch(async (initialError: unknown) => {
            if (normalizedContent === content) {
              throw initialError
            }
            return renderDiagram(normalizedContent)
          })
          .then(({ svg }: { svg: string }) => {
            if (cancelled) return
            setSvgCode(svg)
            if (ref.current) {
              ref.current.innerHTML = svg
            }
          })
          .catch((err: unknown) => {
            console.error('Mermaid render error:', err)
            setHasError(true)
          })
      } catch (err) {
        console.error('Mermaid initialization error:', err)
        setHasError(true)
      }

      return () => {
        cancelled = true
      }
    }
  }, [content, ready])

  if (hasError) {
    return (
      <pre className="overflow-x-auto rounded-lg bg-red-50 p-4 text-sm text-red-500">
        <code>{content}</code>
      </pre>
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div
          className="my-8 flex cursor-zoom-in justify-center overflow-x-auto rounded-lg bg-white p-4 grayscale transition-opacity hover:opacity-90 dark:invert"
          ref={ref}
        />
      </DialogTrigger>
      <DialogContent className="max-h-[95vh] max-w-[95vw] overflow-auto border-none bg-white p-6 shadow-none sm:max-w-[95vw]">
        <DialogTitle className="sr-only">Mermaid Diagram</DialogTitle>
        <div
          className="flex min-h-[50vh] w-full items-center justify-center"
          dangerouslySetInnerHTML={{ __html: svgCode }}
        />
      </DialogContent>
    </Dialog>
  )
}
