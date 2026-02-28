'use client'

import { usePathname } from 'next/navigation'
import { ReactNode, useEffect } from 'react'

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isHome = pathname === '/'
  const isAdmin = pathname?.startsWith('/admin')
  const pageScope = isAdmin ? 'admin' : 'public'
  const scopeClassName = isAdmin ? 'pg-admin-scope' : 'pg-public-scope'
  const transitionClassName = isHome || isAdmin ? '' : 'animate-page-up'

  useEffect(() => {
    document.body.dataset.pageScope = pageScope
    return () => {
      if (document.body.dataset.pageScope === pageScope) {
        delete document.body.dataset.pageScope
      }
    }
  }, [pageScope])

  return (
    <div
      key={pathname}
      data-page-scope={pageScope}
      className={`${scopeClassName} ${transitionClassName}`.trim()}
    >
      {children}
    </div>
  )
}
