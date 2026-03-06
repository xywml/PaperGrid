import sanitizeHtml from 'sanitize-html'

// Structured representation of safe elements extracted from admin-provided HTML.

export type HeadScriptEntry = {
  src: string
  strategy: 'afterInteractive' | 'lazyOnload'
  dataAttributes: Record<string, string>
  integrity?: string
  crossOrigin?: '' | 'anonymous' | 'use-credentials'
}

export type HeadMetaEntry = {
  name?: string
  property?: string
  content: string
}

export type HeadLinkEntry = {
  rel: string
  href: string
  type?: string
  crossOrigin?: string
  integrity?: string
  media?: string
}

export type ParsedHeadInjection = {
  scripts: HeadScriptEntry[]
  metas: HeadMetaEntry[]
  links: HeadLinkEntry[]
  /** Origins extracted from script src for CSP. */
  scriptOrigins: string[]
}

const EMPTY_RESULT: ParsedHeadInjection = {
  scripts: [],
  metas: [],
  links: [],
  scriptOrigins: [],
}

const PARSE_CACHE_MAX_ITEMS = 128
const parseCache = new Map<string, ParsedHeadInjection>()

function getCachedParseResult(input: string): ParsedHeadInjection | null {
  const cached = parseCache.get(input)
  if (!cached) return null
  // Refresh insertion order for simple LRU behavior.
  parseCache.delete(input)
  parseCache.set(input, cached)
  return cached
}

function setCachedParseResult(input: string, result: ParsedHeadInjection) {
  parseCache.set(input, result)
  if (parseCache.size <= PARSE_CACHE_MAX_ITEMS) return
  const oldestKey = parseCache.keys().next().value
  if (oldestKey) parseCache.delete(oldestKey)
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

function isAllowedUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

function extractOrigin(raw: string): string | null {
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Attribute helpers
// ---------------------------------------------------------------------------

const SAFE_CROSSORIGIN_VALUES = new Set(['', 'anonymous', 'use-credentials'])

function parseCrossOrigin(value: string | undefined): '' | 'anonymous' | 'use-credentials' | undefined {
  if (value === undefined) return undefined
  const v = value.toLowerCase()
  return SAFE_CROSSORIGIN_VALUES.has(v) ? (v as '' | 'anonymous' | 'use-credentials') : undefined
}

const SAFE_META_HTTP_EQUIV = new Set([
  'content-type',
  'x-ua-compatible',
  'content-language',
])

const SAFE_LINK_REL = new Set([
  'dns-prefetch',
  'preconnect',
  'prefetch',
  'preload',
  'stylesheet',
  'icon',
  'canonical',
])

// ---------------------------------------------------------------------------
// Tag extractors (operate on sanitize-html output)
// ---------------------------------------------------------------------------

// Match script/meta/link tags while preserving script inner text for validation.
const TAG_RE = /<(script|meta|link)\b([^>]*?)(?:>([\s\S]*?)<\/\1>|\s*\/?>)/gi

const ATTR_RE = /([a-z][a-z0-9\-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  let m: RegExpExecArray | null
  ATTR_RE.lastIndex = 0
  while ((m = ATTR_RE.exec(raw)) !== null) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? ''
  }
  // Handle boolean attributes (e.g., "defer", "async") without values.
  const boolRe = /\b(defer|async)\b/gi
  let bm: RegExpExecArray | null
  boolRe.lastIndex = 0
  while ((bm = boolRe.exec(raw)) !== null) {
    const name = bm[1].toLowerCase()
    if (!(name in attrs)) attrs[name] = ''
  }
  return attrs
}

function extractScript(attrs: Record<string, string>, innerHtml: string): HeadScriptEntry | null {
  // SECURITY: reject inline scripts — only external src allowed.
  if (!attrs.src || innerHtml.trim()) return null
  if (!isAllowedUrl(attrs.src)) return null

  // Reject any event-handler attributes.
  for (const key of Object.keys(attrs)) {
    if (key.startsWith('on')) return null
  }

  const dataAttributes: Record<string, string> = {}
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('data-')) {
      dataAttributes[key] = value
    }
  }

  const strategy: HeadScriptEntry['strategy'] = 'async' in attrs ? 'lazyOnload' : 'afterInteractive'

  return {
    src: attrs.src,
    strategy,
    dataAttributes,
    integrity: attrs.integrity || undefined,
    crossOrigin: parseCrossOrigin(attrs.crossorigin),
  }
}

function extractMeta(attrs: Record<string, string>): HeadMetaEntry | null {
  // Reject event handlers.
  for (const key of Object.keys(attrs)) {
    if (key.startsWith('on')) return null
  }

  // http-equiv: only allow safe subset.
  if (attrs['http-equiv']) {
    if (!SAFE_META_HTTP_EQUIV.has(attrs['http-equiv'].toLowerCase())) return null
  }

  const name = attrs.name || undefined
  const property = attrs.property || undefined
  const content = attrs.content

  if (!content) return null
  if (!name && !property && !attrs['http-equiv']) return null

  return { name, property, content }
}

function extractLink(attrs: Record<string, string>): HeadLinkEntry | null {
  for (const key of Object.keys(attrs)) {
    if (key.startsWith('on')) return null
  }

  const rel = attrs.rel?.toLowerCase()
  const href = attrs.href

  if (!rel || !href) return null
  if (!SAFE_LINK_REL.has(rel)) return null
  if (!isAllowedUrl(href)) return null

  return {
    rel,
    href,
    type: attrs.type || undefined,
    crossOrigin: parseCrossOrigin(attrs.crossorigin) || undefined,
    integrity: attrs.integrity || undefined,
    media: attrs.media || undefined,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const MAX_INPUT_LENGTH = 4096

/**
 * Parse admin-provided HTML and extract only safe, structured elements.
 *
 * Security guarantees:
 * - Only `<script>`, `<meta>`, and `<link>` tags are processed.
 * - Scripts must have a `src` attribute pointing to an HTTPS URL; inline code is rejected.
 * - All event-handler attributes (`on*`) are rejected.
 * - Input length is capped.
 * - HTML is pre-sanitized through `sanitize-html` as a defense-in-depth layer.
 */
export function parseHeadInjection(html: string | null | undefined): ParsedHeadInjection {
  if (!html || typeof html !== 'string') return EMPTY_RESULT

  const trimmed = html.trim()
  if (!trimmed || trimmed.length > MAX_INPUT_LENGTH) return EMPTY_RESULT

  // Fast-path for non-HTML input to avoid sanitize-html overhead.
  if (!/<(script|meta|link)\b/i.test(trimmed)) return EMPTY_RESULT

  const cached = getCachedParseResult(trimmed)
  if (cached) return cached

  // Defense-in-depth: strip anything that isn't script/meta/link with safe attributes.
  const sanitized = sanitizeHtml(trimmed, {
    allowVulnerableTags: true,
    allowedTags: ['script', 'meta', 'link'],
    allowedAttributes: {
      script: ['src', 'defer', 'async', 'type', 'crossorigin', 'integrity', 'data-*'],
      meta: ['name', 'property', 'content', 'charset', 'http-equiv'],
      link: ['rel', 'href', 'type', 'crossorigin', 'integrity', 'media'],
    },
    selfClosing: ['meta', 'link'],
    // Keep data-* attributes on script tags.
    allowedSchemesByTag: {
      script: ['https'],
      link: ['https'],
    },
  })

  const scripts: HeadScriptEntry[] = []
  const metas: HeadMetaEntry[] = []
  const links: HeadLinkEntry[] = []
  const originSet = new Set<string>()

  let match: RegExpExecArray | null
  TAG_RE.lastIndex = 0
  while ((match = TAG_RE.exec(sanitized)) !== null) {
    const tagName = match[1].toLowerCase()
    const attrStr = match[2]
    const inner = match[3] || ''
    const attrs = parseAttributes(attrStr)

    switch (tagName) {
      case 'script': {
        const entry = extractScript(attrs, inner)
        if (entry) {
          scripts.push(entry)
          const origin = extractOrigin(entry.src)
          if (origin) originSet.add(origin)
        }
        break
      }
      case 'meta': {
        const entry = extractMeta(attrs)
        if (entry) metas.push(entry)
        break
      }
      case 'link': {
        const entry = extractLink(attrs)
        if (entry) links.push(entry)
        break
      }
    }
  }

  const result: ParsedHeadInjection = {
    scripts,
    metas,
    links,
    scriptOrigins: Array.from(originSet),
  }

  setCachedParseResult(trimmed, result)
  return result
}
