import Script from 'next/script'
import { parseHeadInjection } from '@/lib/head-inject'

type CustomHeadScriptsProps = {
  raw: string
}

export function CustomHeadScripts({ raw }: CustomHeadScriptsProps) {
  if (!raw) return null

  const { scripts, metas, links } = parseHeadInjection(raw)

  const hasContent = scripts.length > 0 || metas.length > 0 || links.length > 0
  if (!hasContent) return null

  return (
    <>
      {metas.map((meta, i) => (
        <meta
          key={`custom-meta-${i}`}
          {...(meta.name ? { name: meta.name } : {})}
          {...(meta.property ? { property: meta.property } : {})}
          content={meta.content}
        />
      ))}
      {links.map((link, i) => (
        <link
          key={`custom-link-${i}`}
          rel={link.rel}
          href={link.href}
          {...(link.type ? { type: link.type } : {})}
          {...(link.crossOrigin ? { crossOrigin: link.crossOrigin as '' | 'anonymous' | 'use-credentials' } : {})}
          {...(link.integrity ? { integrity: link.integrity } : {})}
          {...(link.media ? { media: link.media } : {})}
        />
      ))}
      {scripts.map((script, i) => (
        <Script
          key={`custom-script-${i}`}
          src={script.src}
          strategy={script.strategy}
          {...script.dataAttributes}
          {...(script.integrity ? { integrity: script.integrity } : {})}
          {...(script.crossOrigin ? { crossOrigin: script.crossOrigin } : {})}
        />
      ))}
    </>
  )
}
