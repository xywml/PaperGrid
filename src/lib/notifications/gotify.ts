export type GotifyOptions = {
  url: string
  token: string
  title?: string
  message?: string
  priority?: number
  timeoutMs?: number
}

export async function sendGotifyNotification(options: GotifyOptions) {
  const {
    url,
    token,
    title = '测试推送',
    message = '这是来自 papergrid 的测试推送',
    priority = 5,
    timeoutMs = 3000,
  } = options

  if (!url || !token) {
    throw new Error('Gotify URL 或 Token 不存在')
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Gotify 超时时间配置无效')
  }

  const baseUrl = url.replace(/\/$/, '')
  const endpoint = `${baseUrl}/message?token=${encodeURIComponent(token)}`

  const payload = {
    title,
    message,
    priority,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Gotify 推送超时（>${timeoutMs}ms）`)
    }
    throw new Error('Gotify 请求失败，请检查 URL 或网络连接')
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    throw new Error(`Gotify 推送失败（HTTP ${res.status}）`)
  }

  return res.json().catch(() => ({ status: 'ok' }))
}
