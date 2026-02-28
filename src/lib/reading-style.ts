export type MobileReadingBackground = 'grid' | 'card'

export const DEFAULT_MOBILE_READING_BACKGROUND: MobileReadingBackground = 'grid'

export function normalizeMobileReadingBackground(raw?: string | null): MobileReadingBackground {
  return raw === 'card' ? 'card' : DEFAULT_MOBILE_READING_BACKGROUND
}

export function getReadingContentClasses(style: MobileReadingBackground) {
  if (style === 'card') {
    return {
      cardClassName: 'pg-reading-mobile-card -mx-3 sm:mx-0',
      contentClassName: 'p-3 sm:p-8',
    }
  }

  return {
    cardClassName: 'pg-reading-no-bg pg-reading-mobile-card-on-desktop',
    contentClassName: 'p-0 sm:p-8',
  }
}
