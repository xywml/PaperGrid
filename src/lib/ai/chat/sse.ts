export type ParsedSseEvent = {
  event: string
  data: unknown
}

function parseSseEventBlock(block: string): ParsedSseEvent | null {
  const lines = block.split('\n')
  let event = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue
    }

    if (line.startsWith('event:')) {
      const next = line.slice('event:'.length).trim()
      if (next) {
        event = next
      }
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }

  const dataText = dataLines.join('\n').trim()
  if (!dataText) {
    return {
      event,
      data: null,
    }
  }

  try {
    return {
      event,
      data: JSON.parse(dataText),
    }
  } catch {
    return {
      event,
      data: { raw: dataText },
    }
  }
}

export async function* iterateSseStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<ParsedSseEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

      let separatorIndex = buffer.indexOf('\n\n')
      while (separatorIndex >= 0) {
        const block = buffer.slice(0, separatorIndex).trim()
        buffer = buffer.slice(separatorIndex + 2)

        if (block) {
          const parsed = parseSseEventBlock(block)
          if (parsed) {
            yield parsed
          }
        }

        separatorIndex = buffer.indexOf('\n\n')
      }
    }

    const tail = `${buffer}${decoder.decode()}`.trim()
    if (tail) {
      const parsed = parseSseEventBlock(tail)
      if (parsed) {
        yield parsed
      }
    }
  } finally {
    reader.releaseLock()
  }
}
