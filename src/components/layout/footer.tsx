'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Github, X, Tv, Mail } from 'lucide-react'
import { isValidHref } from '@/lib/utils'

function parseMpsSetting(rawValue: string): { text: string; href: string } | null {
  const raw = rawValue.trim()
  if (!raw) return null

  const normalized = raw.replace(/\s+/g, '')
  const match = normalized.match(/^[\u4e00-\u9fa5]公网安备(\d{8,})号$/)
  if (!match) return null

  const code = match[1]
  const href = `https://beian.mps.gov.cn/#/query/websearch?code=${code}`
  return { text: normalized, href }
}

export function Footer({ settings }: { settings?: Record<string, unknown> }) {
  const pathname = usePathname()
  const s: Record<string, unknown> = settings || {}
  const getStr = (key: string, fallback = '') =>
    typeof s[key] === 'string' ? (s[key] as string) : fallback
  const getBool = (key: string, fallback = false) =>
    typeof s[key] === 'boolean' ? (s[key] as boolean) : fallback
  const icp = getStr('site.footer_icp')
  const mps = parseMpsSetting(getStr('site.footer_mps'))
  const copyright = getStr('site.footer_copyright')
  const poweredBy = getStr('site.footer_powered_by')
  const ownerName = getStr('site.ownerName', '千叶')
  const description = getStr('site.description', '分享技术文章、生活记录和作品展示的个人博客。')
  const currentYear = getStr('site.currentYear', String(new Date().getUTCFullYear()))
  const githubUrl = getStr('profile.contactGithub', 'https://github.com/xywml/PaperGrid').trim()
  const xUrl = getStr('profile.contactX').trim()
  const bilibiliUrl = getStr('profile.contactBilibili').trim()
  const email = getStr('profile.contactEmail').trim()
  const showGithub = getBool('profile.social.github.enabled', true) && Boolean(githubUrl) && isValidHref(githubUrl)
  const showX = getBool('profile.social.x.enabled', true) && Boolean(xUrl) && isValidHref(xUrl)
  const showBilibili = getBool('profile.social.bilibili.enabled', true) && Boolean(bilibiliUrl) && isValidHref(bilibiliUrl)
  const showEmail = getBool('profile.social.email.enabled', true) && Boolean(email) && isValidHref(`mailto:${email}`)

  if (pathname?.startsWith('/admin')) return null

  return (
    <footer className="pg-public-footer border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* 关于 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">关于</h3>
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">{description}</p>
          </div>

          {/* 快速链接 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">快速链接</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href="/"
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  首页
                </Link>
              </li>
              <li>
                <Link
                  href="/posts"
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  文章
                </Link>
              </li>
              <li>
                <Link
                  href="/archive"
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  归档
                </Link>
              </li>
              <li>
                <Link
                  href="/yaji"
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  雅集
                </Link>
              </li>
              <li>
                <Link
                  href="/categories"
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  分类
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  关于
                </Link>
              </li>
            </ul>
          </div>

          {/* 分类 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">分类</h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href="/categories/tech"
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  技术分享
                </Link>
              </li>
              <li>
                <Link
                  href="/categories/life"
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  生活记录
                </Link>
              </li>
              <li>
                <Link
                  href="/yaji"
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  雅集
                </Link>
              </li>
            </ul>
          </div>

          {/* 社交媒体 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">联系我</h3>
            {showGithub || showX || showBilibili || showEmail ? (
              <div className="mt-4 flex items-center gap-4">
                {showGithub && (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  >
                    <Github className="h-5 w-5" />
                  </a>
                )}
                {showX && (
                  <a
                    href={xUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </a>
                )}
                {showBilibili && (
                  <a
                    href={bilibiliUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  >
                    <Tv className="h-5 w-5" />
                  </a>
                )}
                {showEmail && (
                  <a
                    href={`mailto:${email}`}
                    className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                  >
                    <Mail className="h-5 w-5" />
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">暂未配置联系方式</p>
            )}
          </div>
        </div>

        {/* 版权信息 */}
        <div className="mt-12 border-t border-gray-200 pt-8 dark:border-gray-800">
          <div className="space-y-2 text-center text-sm text-gray-600 dark:text-gray-400">
            {icp && (
              <p>
                <a
                  href="https://beian.miit.gov.cn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-gray-900 dark:hover:text-white"
                >
                  {icp}
                </a>
              </p>
            )}
            {mps && (
              <p>
                <a
                  href={mps.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 transition-colors hover:text-gray-900 dark:hover:text-white"
                >
                  <Image
                    src="/assets/mps-beian-logo.png"
                    alt="公安备案"
                    width={16}
                    height={16}
                    className="h-4 w-4"
                  />
                  <span>{mps.text}</span>
                </a>
              </p>
            )}
            <p>{copyright || `© ${currentYear} ${ownerName}. 保留所有权利.`}</p>
            {poweredBy && <p className="opacity-80">{poweredBy}</p>}
          </div>
        </div>
      </div>
    </footer>
  )
}
