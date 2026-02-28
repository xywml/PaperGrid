'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles, Github, X, Tv, Mail, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isValidHref } from '@/lib/utils'

export function HeroSection({ settings }: { settings?: Record<string, unknown> }) {
  const [mounted, setMounted] = useState(false)
  const [text, setText] = useState('')
  const [index, setIndex] = useState(0)
  const s: Record<string, unknown> = settings || {}
  const getStr = (key: string, fallback = '') =>
    typeof s[key] === 'string' ? (s[key] as string) : fallback
  const getBool = (key: string, fallback = false) =>
    typeof s[key] === 'boolean' ? (s[key] as boolean) : fallback

  const defaultTitles = [
    '欢迎来到我的博客',
    '探索技术的无限可能',
    '记录成长的点点滴滴',
    '分享代码与生活的美好'
  ]
  const rawTitles = getStr('hero.typingTitles')
  const titles = rawTitles
    ? rawTitles
        .split(/\r?\n/)
        .flatMap((line: string) => line.split(/[|｜]/))
        .map((t: string) => t.trim())
        .filter(Boolean)
    : defaultTitles
  const subtitle = getStr('hero.subtitle', '全栈开发者 / 开源爱好者 / 终身学习者')
  const location = getStr('hero.location', '中国 · 热爱技术')
  const avatarUrl = getStr('site.defaultAvatarUrl')
  const ownerName = getStr('site.ownerName', 'ME')
  const githubUrl = getStr('profile.contactGithub', 'https://github.com/xywml/PaperGrid').trim()
  const xUrl = getStr('profile.contactX').trim()
  const bilibiliUrl = getStr('profile.contactBilibili').trim()
  const email = getStr('profile.contactEmail').trim()
  const showGithub = getBool('profile.social.github.enabled', true) && Boolean(githubUrl) && isValidHref(githubUrl)
  const showX = getBool('profile.social.x.enabled', true) && Boolean(xUrl) && isValidHref(xUrl)
  const showBilibili = getBool('profile.social.bilibili.enabled', true) && Boolean(bilibiliUrl) && isValidHref(bilibiliUrl)
  const showEmail = getBool('profile.social.email.enabled', true) && Boolean(email) && isValidHref(`mailto:${email}`)
  const hasSocialLinks = showGithub || showX || showBilibili || showEmail

  useEffect(() => {
    // 稍微延迟一点点，确保浏览器已经渲染完毕，从而能观察到动画
    const timer = setTimeout(() => {
      setMounted(true)
    }, 50)
    return () => clearTimeout(timer)
  }, [])

  // 打字机效果
  useEffect(() => {
    if (!mounted) return

    const currentTitle = titles[index]
    let currentIndex = 0
    let isDeleting = false
    let timeout: NodeJS.Timeout

    const type = () => {
      if (isDeleting) {
        setText(currentTitle.slice(0, currentIndex - 1))
        currentIndex--
      } else {
        setText(currentTitle.slice(0, currentIndex + 1))
        currentIndex++
      }

      const timeoutSpeed = isDeleting ? 50 : 100

      if (!isDeleting && currentIndex === currentTitle.length) {
        timeout = setTimeout(() => {
          isDeleting = true
          type()
        }, 2000)
      } else if (isDeleting && currentIndex === 0) {
        isDeleting = false
        setIndex((prevIndex) => (prevIndex + 1) % titles.length)
        timeout = setTimeout(type, 500)
      } else {
        timeout = setTimeout(type, timeoutSpeed)
      }
    }

    type()

    return () => clearTimeout(timeout)
  }, [mounted, index])

  return (
    <section className="relative overflow-hidden bg-transparent min-h-screen flex items-center">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col items-center gap-8">
          {/* 头像 */}
          <div
            className={`transition-all duration-1000 ease-out ${
              mounted ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-90'
            }`}
          >
              <div className="relative group">
                <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-full border-2 border-gray-900 dark:border-white p-1 overflow-hidden">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={ownerName || 'Avatar'}
                    className="w-full h-full rounded-full object-cover"
                    loading="eager"
                    decoding="async"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-4xl sm:text-5xl font-serif font-bold text-gray-900 dark:text-white">
                    {(ownerName || 'ME').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              {/* 在线状态点 */}
              <div className="absolute bottom-2 right-2 w-6 h-6 bg-green-500 rounded-full border-4 border-white dark:border-gray-900" />
            </div>
          </div>

          {/* 标题 - 打字机效果 */}
          <div
            className={`transition-all duration-1000 delay-200 ease-out ${
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
            }`}
          >
            <h1 className="text-4xl font-serif font-bold tracking-tight text-gray-900 dark:text-white sm:text-6xl min-h-[4.5rem] sm:min-h-[5.5rem] text-center">
              <span className="relative inline-block">
                {text}
                <span className="inline-block w-0.5 h-12 sm:h-16 bg-gray-900 dark:bg-white ml-1 animate-blink" />
              </span>
            </h1>
          </div>

          {/* 描述 */}
          <div
            className={`transition-all duration-1000 delay-400 ease-out ${
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
            }`}
          >
            <p className="mx-auto max-w-2xl text-lg leading-8 text-gray-600 dark:text-gray-400">
              {subtitle}
            </p>
          </div>

          {/* 位置信息 */}
          <div
            className={`transition-all duration-1000 delay-500 ease-out ${
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
            }`}
          >
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">{location}</span>
            </div>
          </div>

          {/* 按钮组 */}
          <div
            className={`transition-all duration-1000 delay-600 ease-out flex items-center justify-center gap-4 ${
              mounted ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
            }`}
          >
            <Link href="/posts">
              <Button
                size="lg"
                className="group bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 shadow-md hover:shadow-lg transition-all duration-300"
              >
                浏览文章
                <ArrowRight className="ml-2 h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link href="/about">
              <Button
                size="lg"
                variant="outline"
                className="border-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-300"
              >
                关于我
              </Button>
            </Link>
          </div>

          {/* 社交链接 */}
          {hasSocialLinks && (
            <div
              className={`transition-all duration-1000 delay-700 ease-out ${
                mounted ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
              }`}
            >
              <div className="flex items-center gap-4">
                {showGithub && (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-full bg-white dark:bg-gray-800 shadow-md hover:shadow-lg hover:scale-110 transition-all duration-300"
                  >
                    <Github className="h-5 w-5 text-gray-900 dark:text-white" />
                  </a>
                )}
                {showX && (
                  <a
                    href={xUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-full bg-white dark:bg-gray-800 shadow-md hover:shadow-lg hover:scale-110 transition-all duration-300"
                  >
                    <X className="h-5 w-5 text-gray-900 dark:text-white" />
                  </a>
                )}
                {showBilibili && (
                  <a
                    href={bilibiliUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-full bg-white dark:bg-gray-800 shadow-md hover:shadow-lg hover:scale-110 transition-all duration-300"
                  >
                    <Tv className="h-5 w-5 text-gray-900 dark:text-white" />
                  </a>
                )}
                {showEmail && (
                  <a
                    href={`mailto:${email}`}
                    className="p-3 rounded-full bg-white dark:bg-gray-800 shadow-md hover:shadow-lg hover:scale-110 transition-all duration-300"
                  >
                    <Mail className="h-5 w-5 text-gray-900 dark:text-white" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.05);
          }
        }
        @keyframes blink {
          0%, 50% {
            opacity: 1;
          }
          51%, 100% {
            opacity: 0;
          }
        }
        @keyframes tilt {
          0%, 100% {
            transform: rotate(0deg);
          }
          25% {
            transform: rotate(3deg);
          }
          75% {
            transform: rotate(-3deg);
          }
        }
        .animate-pulse {
          animation: pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .animate-blink {
          animation: blink 1s step-end infinite;
        }
        .animate-tilt {
          animation: tilt 3s ease-in-out infinite;
        }
        .delay-1000 {
          animation-delay: 1s;
        }
        .delay-700 {
          animation-delay: 0.7s;
        }
      `}</style>
    </section>
  )
}
