import { promisify } from 'node:util'
import { deflateRawSync, inflateRaw } from 'node:zlib'

export type ZipEntryInput = {
  name: string
  data: Buffer
  mtime?: Date
}

export type ZipEntry = {
  name: string
  data: Buffer
}

const ZIP_SIG_LOCAL = 0x04034b50
const ZIP_SIG_CENTRAL = 0x02014b50
const ZIP_SIG_EOCD = 0x06054b50
const ZIP_FLAG_UTF8 = 0x0800
const ZIP_METHOD_STORE = 0
const ZIP_METHOD_DEFLATE = 8
const MAX_ENTRY_COUNT = 2000
const MAX_ENTRY_UNCOMPRESSED_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
const MAX_COMPRESSION_RATIO = 1000

const inflateRawAsync = promisify(inflateRaw)

let crcTable: Uint32Array | null = null

function getCrcTable() {
  if (crcTable) return crcTable

  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c >>> 0
  }
  crcTable = table
  return table
}

function crc32(buffer: Buffer) {
  const table = getCrcTable()
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    const index = (crc ^ buffer[i]) & 0xff
    crc = table[index] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function toDosDateTime(input: Date) {
  const date = new Date(input)
  const year = Math.min(2107, Math.max(1980, date.getFullYear()))
  const month = Math.min(12, Math.max(1, date.getMonth() + 1))
  const day = Math.min(31, Math.max(1, date.getDate()))
  const hours = Math.min(23, Math.max(0, date.getHours()))
  const minutes = Math.min(59, Math.max(0, date.getMinutes()))
  const seconds = Math.min(59, Math.max(0, date.getSeconds()))

  const dosTime = (hours << 11) | (minutes << 5) | Math.floor(seconds / 2)
  const dosDate = ((year - 1980) << 9) | (month << 5) | day

  return {
    dosDate,
    dosTime,
  }
}

function sanitizeEntryName(name: string): string {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '')
  const cleaned = normalized
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/')
  return cleaned || 'file.txt'
}

function ensureRange(buffer: Buffer, start: number, length: number) {
  if (start < 0 || length < 0 || start + length > buffer.length) {
    throw new Error('ZIP 数据损坏')
  }
}

function findEocdOffset(buffer: Buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22)
  for (let i = buffer.length - 22; i >= minOffset; i -= 1) {
    if (buffer.readUInt32LE(i) === ZIP_SIG_EOCD) {
      return i
    }
  }
  return -1
}

export function createZip(entries: ZipEntryInput[]) {
  const localChunks: Buffer[] = []
  const centralChunks: Buffer[] = []
  let localOffset = 0

  for (const entry of entries) {
    const fileName = sanitizeEntryName(entry.name)
    const fileNameBuffer = Buffer.from(fileName, 'utf8')
    const source = Buffer.from(entry.data)
    const compressed = deflateRawSync(source)
    const useDeflate = compressed.length < source.length
    const method = useDeflate ? ZIP_METHOD_DEFLATE : ZIP_METHOD_STORE
    const payload = useDeflate ? compressed : source
    const crc = crc32(source)
    const { dosDate, dosTime } = toDosDateTime(entry.mtime || new Date())

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(ZIP_SIG_LOCAL, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(ZIP_FLAG_UTF8, 6)
    localHeader.writeUInt16LE(method, 8)
    localHeader.writeUInt16LE(dosTime, 10)
    localHeader.writeUInt16LE(dosDate, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(payload.length, 18)
    localHeader.writeUInt32LE(source.length, 22)
    localHeader.writeUInt16LE(fileNameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28)

    localChunks.push(localHeader, fileNameBuffer, payload)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(ZIP_SIG_CENTRAL, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(ZIP_FLAG_UTF8, 8)
    centralHeader.writeUInt16LE(method, 10)
    centralHeader.writeUInt16LE(dosTime, 12)
    centralHeader.writeUInt16LE(dosDate, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(payload.length, 20)
    centralHeader.writeUInt32LE(source.length, 24)
    centralHeader.writeUInt16LE(fileNameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(localOffset, 42)

    centralChunks.push(centralHeader, fileNameBuffer)
    localOffset += localHeader.length + fileNameBuffer.length + payload.length
  }

  const centralDirectory = Buffer.concat(centralChunks)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(ZIP_SIG_EOCD, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDirectory.length, 12)
  eocd.writeUInt32LE(localOffset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localChunks, centralDirectory, eocd])
}

export async function extractZipEntries(buffer: Buffer): Promise<ZipEntry[]> {
  const eocdOffset = findEocdOffset(buffer)
  if (eocdOffset < 0) {
    throw new Error('无法识别 ZIP 结尾目录')
  }

  ensureRange(buffer, eocdOffset, 22)

  const entryCount = buffer.readUInt16LE(eocdOffset + 10)
  if (entryCount > MAX_ENTRY_COUNT) {
    throw new Error(`ZIP 条目数量超过限制（最大 ${MAX_ENTRY_COUNT}）`)
  }
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16)

  let cursor = centralDirOffset
  const entries: ZipEntry[] = []
  let totalUncompressedBytes = 0

  for (let i = 0; i < entryCount; i += 1) {
    ensureRange(buffer, cursor, 46)
    if (buffer.readUInt32LE(cursor) !== ZIP_SIG_CENTRAL) {
      throw new Error('ZIP 中央目录损坏')
    }

    const flags = buffer.readUInt16LE(cursor + 8)
    const method = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const uncompressedSize = buffer.readUInt32LE(cursor + 24)
    const fileNameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42)

    const nameOffset = cursor + 46
    ensureRange(buffer, nameOffset, fileNameLength)

    const encoding = (flags & ZIP_FLAG_UTF8) === ZIP_FLAG_UTF8 ? 'utf8' : 'utf8'
    const rawName = buffer.subarray(nameOffset, nameOffset + fileNameLength).toString(encoding)
    const fileName = sanitizeEntryName(rawName)
    cursor = nameOffset + fileNameLength + extraLength + commentLength

    if (!fileName || rawName.endsWith('/')) {
      continue
    }

    if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
      throw new Error(`ZIP 条目 "${fileName}" 超过单文件大小限制`)
    }

    if (compressedSize > 0 && uncompressedSize > 0) {
      const ratio = uncompressedSize / compressedSize
      if (ratio > MAX_COMPRESSION_RATIO) {
        throw new Error(`ZIP 条目 "${fileName}" 压缩比异常，已拒绝`)
      }
    }

    ensureRange(buffer, localHeaderOffset, 30)
    if (buffer.readUInt32LE(localHeaderOffset) !== ZIP_SIG_LOCAL) {
      throw new Error(`ZIP 条目 "${fileName}" 的本地头损坏`)
    }

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28)
    const payloadOffset = localHeaderOffset + 30 + localNameLength + localExtraLength
    ensureRange(buffer, payloadOffset, compressedSize)
    const compressed = buffer.subarray(payloadOffset, payloadOffset + compressedSize)

    let data: Buffer
    if (method === ZIP_METHOD_STORE) {
      data = Buffer.from(compressed)
    } else if (method === ZIP_METHOD_DEFLATE) {
      const inflated = await inflateRawAsync(compressed, {
        maxOutputLength: MAX_ENTRY_UNCOMPRESSED_BYTES,
      })
      data = Buffer.isBuffer(inflated) ? inflated : Buffer.from(inflated)
    } else {
      throw new Error(`ZIP 条目 "${fileName}" 使用了不支持的压缩方式 (${method})`)
    }

    if (data.length > MAX_ENTRY_UNCOMPRESSED_BYTES) {
      throw new Error(`ZIP 条目 "${fileName}" 超过单文件大小限制`)
    }

    totalUncompressedBytes += data.length
    if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error('ZIP 解压总大小超过限制')
    }

    if (uncompressedSize > 0 && data.length !== uncompressedSize) {
      throw new Error(`ZIP 条目 "${fileName}" 解压后长度不匹配`)
    }

    entries.push({
      name: fileName,
      data,
    })
  }

  return entries
}
