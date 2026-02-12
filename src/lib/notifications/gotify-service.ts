import { getSetting } from '@/lib/settings'
import { sendGotifyNotification } from './gotify'

type CommentStatus = 'PENDING' | 'APPROVED' | 'SPAM' | 'REJECTED'

type GotifyConfig = {
  enabled: boolean
  notifyNew: boolean
  notifyPending: boolean
  url: string
  token: string
}

type GotifySwitchConfig = Pick<GotifyConfig, 'enabled' | 'notifyNew' | 'notifyPending'>
type GotifyCredentialConfig = Pick<GotifyConfig, 'url' | 'token'>

export type CommentGotifyNotificationInput = {
  status: CommentStatus
  content: string
  authorName: string | null
  author: {
    name: string | null
    image: string | null
  } | null
  post: {
    title: string
  }
}

export class GotifyServiceError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GotifyServiceError'
    this.status = status
  }
}

async function getGotifySwitchConfig(): Promise<GotifySwitchConfig> {
  const [enabledRaw, notifyNewRaw, notifyPendingRaw] = await Promise.all([
    getSetting<boolean>('notifications.gotify.enabled', false),
    getSetting<boolean>('notifications.gotify.notifyNewComment', true),
    getSetting<boolean>('notifications.gotify.notifyPendingComment', true),
  ])

  return {
    enabled: enabledRaw ?? false,
    notifyNew: notifyNewRaw ?? true,
    notifyPending: notifyPendingRaw ?? true,
  }
}

async function getGotifyCredentialConfig(): Promise<GotifyCredentialConfig> {
  const [settingUrlRaw, settingTokenRaw] = await Promise.all([
    getSetting<string>('notifications.gotify.url', ''),
    getSetting<string>('notifications.gotify.token', ''),
  ])

  return {
    url: (process.env.GOTIFY_URL || settingUrlRaw || '').trim(),
    token: (process.env.GOTIFY_TOKEN || settingTokenRaw || '').trim(),
  }
}

function getMissingConfigItems(config: GotifyCredentialConfig): string[] {
  const missing: string[] = []
  if (!config.url) missing.push('url')
  if (!config.token) missing.push('token')
  return missing
}

export async function sendCommentGotifyNotification(input: CommentGotifyNotificationInput): Promise<void> {
  const switchConfig = await getGotifySwitchConfig()
  if (!switchConfig.enabled) return

  const shouldNotifyPending = input.status === 'PENDING' && switchConfig.notifyPending
  const shouldNotifyNew = input.status === 'APPROVED' && switchConfig.notifyNew
  if (!shouldNotifyPending && !shouldNotifyNew) return

  const credentialConfig = await getGotifyCredentialConfig()
  const missing = getMissingConfigItems(credentialConfig)
  if (missing.length > 0) return

  const authorLabel = input.author?.name || input.authorName || '匿名用户'
  const summary = input.content.length > 120 ? `${input.content.slice(0, 120)}…` : input.content
  const title = shouldNotifyPending ? '新评论待审核' : '新评论'
  const message = [
    `文章：${input.post.title}`,
    `作者：${authorLabel}`,
    `摘要：${summary}`,
  ].join('\n')

  await sendGotifyNotification({
    url: credentialConfig.url,
    token: credentialConfig.token,
    title,
    message,
    priority: shouldNotifyPending ? 8 : 5,
  })
}

export type GotifyTestNotificationInput = {
  title?: string
  message?: string
  priority?: number
}

export async function sendGotifyTestNotification(input: GotifyTestNotificationInput): Promise<void> {
  const switchConfig = await getGotifySwitchConfig()
  if (!switchConfig.enabled) {
    throw new GotifyServiceError('Gotify 推送未启用', 400)
  }

  const credentialConfig = await getGotifyCredentialConfig()
  const missing = getMissingConfigItems(credentialConfig)
  if (missing.length > 0) {
    throw new GotifyServiceError(`Gotify 配置不完整（缺少 ${missing.join(' / ')}）`, 400)
  }

  const title = input.title?.trim() || '测试推送 - 执笔为剑'
  const message = input.message?.trim() || '这是一条来自 执笔为剑 的 Gotify 测试通知'
  const priority = Number.isFinite(input.priority) ? Number(input.priority) : 5

  await sendGotifyNotification({
    url: credentialConfig.url,
    token: credentialConfig.token,
    title,
    message,
    priority,
  })
}
