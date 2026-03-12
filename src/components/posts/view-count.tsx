'use client'

import { useEffect, useState } from 'react'

type ViewCountMode = 'track' | 'read'

async function fetchCurrentViewCount(slug: string) {
  const res = await fetch(`/api/posts/views?slug=${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  })
  if (!res.ok) {
    return null
  }
  const data = await res.json().catch(() => null)
  return data && typeof data.count === 'number' ? data.count : null
}

export function ViewCount({
  slug,
  initialCount,
  mode = 'track',
}: {
  slug: string
  initialCount: number
  mode?: ViewCountMode
}) {
  const [count, setCount] = useState(initialCount)

  useEffect(() => {
    setCount(initialCount)
  }, [initialCount, slug])

  useEffect(() => {
    if (!slug) return

    let cancelled = false

    const applyCount = (nextCount: number | null) => {
      if (!cancelled && typeof nextCount === 'number') {
        setCount(nextCount)
      }
    }

    const syncCurrentCount = async () => {
      const nextCount = await fetchCurrentViewCount(slug).catch(() => null)
      applyCount(nextCount)
    }

    if (mode === 'read') {
      void syncCurrentCount()
      return () => {
        cancelled = true
      }
    }

    // 同一访客短时间内重复刷新不重复计数，减少写入压力
    const storageKey = `viewed:${slug}`
    const now = Date.now()
    const cooldownMs = 10 * 60 * 1000
    let shouldIncrement = true

    try {
      const last = Number(localStorage.getItem(storageKey) || 0)
      if (Number.isFinite(last) && last > 0 && now - last < cooldownMs) {
        shouldIncrement = false
      } else {
        localStorage.setItem(storageKey, String(now))
      }
    } catch {
      // ignore
    }

    if (!shouldIncrement) {
      void syncCurrentCount()
      return () => {
        cancelled = true
      }
    }

    void fetch('/api/posts/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
      keepalive: true,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data) => {
        if (data && typeof data.count === 'number') {
          applyCount(data.count)
          return
        }
        await syncCurrentCount()
      })
      .catch(async () => {
        await syncCurrentCount()
      })

    return () => {
      cancelled = true
    }
  }, [mode, slug])

  return <span>{count}</span>
}
