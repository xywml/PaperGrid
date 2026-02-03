export type MobileReadingBackground = 'grid' | 'card'

export const DEFAULT_MOBILE_READING_BACKGROUND: MobileReadingBackground = 'grid'

export function normalizeMobileReadingBackground(raw?: string | null): MobileReadingBackground {
  return raw === 'card' ? 'card' : DEFAULT_MOBILE_READING_BACKGROUND
}

export function getReadingContentClasses(style: MobileReadingBackground) {
  if (style === 'card') {
    return {
      cardClassName: 'bg-card shadow-sm -mx-3 sm:mx-0',
      contentClassName: 'p-3 sm:p-8',
    }
  }

  return {
    cardClassName: 'bg-transparent shadow-none border-none sm:bg-card sm:shadow-sm sm:border',
    contentClassName: 'p-0 sm:p-8',
  }
}
