import type { Metadata } from 'next'
import { Geist, Geist_Mono, Noto_Serif_SC } from 'next/font/google'
import './globals.css'
import 'katex/dist/katex.min.css'
import 'streamdown/styles.css'
import { Suspense } from 'react'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { SessionProvider } from '@/components/auth/session-provider'
import { ScrollProgress } from '@/components/layout/scroll-progress'
import { BackToTop } from '@/components/layout/back-to-top'
import { PageTransition } from '@/components/layout/page-transition'
import { getPublicSettings, getSetting } from '@/lib/settings'
import { Toaster } from '@/components/ui/toaster'
import { SiteLoading } from '@/components/layout/site-loading'
import {
  DEFAULT_PUBLIC_STYLE_PRESET,
  getPublicStylePresetStylesheet,
  normalizePublicStylePreset,
} from '@/lib/public-style-preset'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const notoSerif = Noto_Serif_SC({
  variable: '--font-noto-serif',
  subsets: ['latin'],
  weight: ['400', '700', '900'],
})

export async function generateMetadata(): Promise<Metadata> {
  const title = (await getSetting<string>('site.title', '执笔为剑')) || '执笔为剑'
  const description = (await getSetting<string>('site.description', '分享技术文章、生活记录和作品展示的个人博客'))
  const faviconUrl = (await getSetting<string>('site.faviconUrl', '')) || ''
  return {
    title,
    description,
    ...(faviconUrl ? { icons: { icon: faviconUrl } } : {}),
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const currentYear = String(new Date().getUTCFullYear())
  const [defaultTheme, publicSettings] = await Promise.all([
    getSetting<string>('site.defaultTheme', 'system'),
    getPublicSettings(),
  ])
  const publicStylePresetRaw =
    typeof publicSettings['ui.publicStylePreset'] === 'string'
      ? publicSettings['ui.publicStylePreset']
      : DEFAULT_PUBLIC_STYLE_PRESET
  const publicStylePreset = normalizePublicStylePreset(publicStylePresetRaw)
  const publicPresetStylesheet = getPublicStylePresetStylesheet(publicStylePreset)
  const footerSettings = { ...publicSettings, 'site.currentYear': currentYear }

  return (
    <html lang="zh" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href={publicPresetStylesheet} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoSerif.variable} antialiased font-serif`}
        data-public-style-preset={publicStylePreset}
      >
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme={defaultTheme || 'system'}
            enableSystem
            disableTransitionOnChange
          >
            <div className="min-h-screen flex flex-col">
              <ScrollProgress />
              <Suspense fallback={null}>
                <SiteLoading />
              </Suspense>
              <Navbar settings={publicSettings} />
              <main className="flex-1">
                <PageTransition>{children}</PageTransition>
              </main>
              <Footer settings={footerSettings} />
              <BackToTop />
              <Toaster />
            </div>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
