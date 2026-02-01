import { createHmac, timingSafeEqual } from 'crypto'

export const POST_UNLOCK_MAX_AGE = 60 * 60 * 24 * 3
const POST_UNLOCK_TOKEN_HEADER = 'x-post-unlock-token'

function getPostUnlockSecret() {
  return (
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.APP_SECRET ||
    'papergrid_dev_secret'
  )
}

export function buildPostUnlockToken(postId: string, passwordHash: string) {
  return createHmac('sha256', getPostUnlockSecret())
    .update(`${postId}:${passwordHash}`)
    .digest('base64url')
}

export function verifyPostUnlockToken(token: string, postId: string, passwordHash: string) {
  if (!token || !passwordHash) return false
  const expected = buildPostUnlockToken(postId, passwordHash)
  if (expected.length !== token.length) return false
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
}

export function getPostUnlockTokenFromHeaders(headers: Headers) {
  const auth = headers.get('authorization') || ''
  if (auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim()
    if (token) return token
  }
  const fallback = headers.get(POST_UNLOCK_TOKEN_HEADER) || ''
  return fallback.trim()
}
