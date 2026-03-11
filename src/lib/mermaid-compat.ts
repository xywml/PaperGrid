const FLOWCHART_OPENERS = [
  { open: '[[', close: ']]' },
  { open: '((', close: '))' },
  { open: '([', close: '])' },
  { open: '[/', close: '/]' },
  { open: '[\\', close: '\\]' },
  { open: '[', close: ']' },
  { open: '{', close: '}' },
  { open: '(', close: ')' },
] as const

function isIdentifierChar(char: string | undefined) {
  return !!char && /[A-Za-z0-9_.-]/.test(char)
}

function isIdentifierStart(char: string | undefined) {
  return !!char && /[A-Za-z0-9_]/.test(char)
}

function quoteMermaidLabel(label: string) {
  if (!label.includes('@')) return label

  const leading = label.match(/^\s*/)?.[0] ?? ''
  const trailing = label.match(/\s*$/)?.[0] ?? ''
  const core = label.slice(leading.length, label.length - trailing.length)
  const trimmed = core.trim()

  if (!trimmed) return label
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('`') && trimmed.endsWith('`'))
  ) {
    return label
  }

  const escaped = core.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `${leading}"${escaped}"${trailing}`
}

function normalizeFlowchartNodeLabels(line: string) {
  let cursor = 0
  let output = ''
  let index = 0

  while (index < line.length) {
    let replacement: { start: number; end: number; value: string } | null = null

    for (const shape of FLOWCHART_OPENERS) {
      if (!line.startsWith(shape.open, index)) continue

      let idEnd = index - 1
      while (idEnd >= 0 && line[idEnd] === ' ') {
        idEnd -= 1
      }

      if (!isIdentifierChar(line[idEnd])) continue

      let idStart = idEnd
      while (idStart >= 0 && isIdentifierChar(line[idStart])) {
        idStart -= 1
      }
      idStart += 1

      if (!isIdentifierStart(line[idStart])) continue

      const labelStart = index + shape.open.length
      const labelEnd = line.indexOf(shape.close, labelStart)
      if (labelEnd === -1) continue

      const nextValue = quoteMermaidLabel(line.slice(labelStart, labelEnd))
      if (nextValue === line.slice(labelStart, labelEnd)) continue

      replacement = {
        start: labelStart,
        end: labelEnd,
        value: nextValue,
      }
      break
    }

    if (!replacement) {
      index += 1
      continue
    }

    output += line.slice(cursor, replacement.start) + replacement.value
    cursor = replacement.end
    index = replacement.end
  }

  return output + line.slice(cursor)
}

function normalizeFlowchartEdgeLabels(line: string) {
  return line.replace(/\|([^|\n]+)\|/g, (fullMatch, label: string) => {
    const nextValue = quoteMermaidLabel(label)
    if (nextValue === label) return fullMatch
    return `|${nextValue}|`
  })
}

export function normalizeMermaidForCompatibility(source: string) {
  const lines = source.split(/\r?\n/)
  const firstMeaningfulLine = lines
    .find((line) => {
      const trimmed = line.trim()
      return trimmed && !trimmed.startsWith('%%')
    })
    ?.trim()

  if (!firstMeaningfulLine || !/^(flowchart|graph)\b/i.test(firstMeaningfulLine)) {
    return source
  }

  return lines
    .map((line) => normalizeFlowchartEdgeLabels(normalizeFlowchartNodeLabels(line)))
    .join('\n')
}
