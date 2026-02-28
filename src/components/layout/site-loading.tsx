'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function SiteLoading() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(false)

  const trigger = () => {
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), 600)
  }

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    if (pathname?.startsWith('/admin') || pathname?.startsWith('/auth')) {
      setVisible(false)
      return
    }
    trigger()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [pathname, searchParams?.toString()])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (pathname?.startsWith('/admin') || pathname?.startsWith('/auth')) return
      const target = event.target as HTMLElement | null
      const anchor = target?.closest('a') as HTMLAnchorElement | null
      if (!anchor) return
      if (anchor.target === '_blank') return
      const href = anchor.getAttribute('href')
      if (!href) return
      const url = new URL(anchor.href, window.location.origin)
      if (url.origin !== window.location.origin) return
      if (url.pathname.startsWith('/posts/') && url.pathname !== '/posts') {
        trigger()
      }
    }

    document.addEventListener('click', handleClick, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
    }
  }, [pathname])

  if (!visible) return null

  return (
    <div className="pointer-events-none fixed top-4 left-1/2 z-[70] -translate-x-1/2">
      <div className="pg-site-loading-track relative h-1 w-28 overflow-hidden rounded-full">
        <div className="pg-site-loading-fill site-loading-bar h-full w-1/2 rounded-full" />
      </div>
    </div>
  )
}
