'use client'

import { useEffect, useRef } from 'react'
import styles from './click-halo.module.css'

const SVG_NS = 'http://www.w3.org/2000/svg'
const BURST_CENTER = 48
const TRAIL_LIFETIME_MS = 380
const TRAIL_MAX_LENGTH = 150
const TRAIL_MIN_DISTANCE = 5
const TRAIL_MAX_POINTS = 56
const SHARD_EVERY_DISTANCE = 145

type Point = { x: number; y: number; t: number }

type Palette = {
  trailStroke: string
  trailFilter: string
  ringA: string
  ringB: string
  ringFilter: string
  flashBg: string
  flashShadow: string
}

/* Light theme (day): white energy core with a pale azure halo — blue only
   lives in the outer glow so the stroke itself stays crisp on the pale page. */
const LIGHT: Palette = {
  trailStroke: '#dff9ff',
  trailFilter: 'drop-shadow(0 0 3px #ffffff) drop-shadow(0 0 7px #72dfff)',
  ringA: '#ffffff',
  ringB: '#bcefff',
  ringFilter: 'drop-shadow(0 0 3px #ffffff) drop-shadow(0 0 8px #7edfff)',
  flashBg:
    'radial-gradient(circle, #ffffff 0%, #e6fbff 35%, rgba(126,224,255,.35) 60%, transparent 75%)',
  flashShadow: '0 0 12px #ffffff, 0 0 28px #75ddff',
}

/* Dark theme (night): bright white core with an ink-blue outer glow — the
   trail itself stays luminous, only the halo carries the deep blue. */
const DARK: Palette = {
  trailStroke: '#f1f8ff',
  trailFilter: 'drop-shadow(0 0 3px #ffffff) drop-shadow(0 0 8px #7398b8)',
  ringA: '#f4fbff',
  ringB: '#a9c6da',
  ringFilter: 'drop-shadow(0 0 4px #ffffff) drop-shadow(0 0 9px #527695)',
  flashBg:
    'radial-gradient(circle, #ffffff 0%, #d8e9f3 32%, rgba(94,139,171,.35) 60%, transparent 76%)',
  flashShadow: '0 0 10px #ffffff, 0 0 24px #6388a5',
}

function random(min: number, max: number) {
  return min + Math.random() * (max - min)
}

/* Comet ribbon: a filled outline whose width swells from a hairline tail to a
   rounded bulb at the pointer — the game's trail is a tadpole, not a stroke. */
function buildCometD(points: Point[]) {
  const n = points.length
  if (n < 3) return ''
  const wAt = (i: number) => 0.7 + 8.3 * Math.pow(i / (n - 1), 1.6)
  const left: Point[] = []
  const right: Point[] = []
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(n - 1, i + 1)]
    let nx = prev.y - next.y
    let ny = next.x - prev.x
    const len = Math.hypot(nx, ny) || 1
    const w = wAt(i) / 2
    left.push({ x: p.x + (nx / len) * w, y: p.y + (ny / len) * w })
    right.push({ x: p.x - (nx / len) * w, y: p.y - (ny / len) * w })
  }
  const half = (pts: Point[], from: number, to: number, step: number) => {
    let d = ''
    for (let i = from; i !== to; i += step) {
      const mx = (pts[i].x + pts[i + step].x) / 2
      const my = (pts[i].y + pts[i + step].y) / 2
      d += ` Q ${pts[i].x} ${pts[i].y} ${mx} ${my}`
    }
    return d
  }
  const head = points[n - 1]
  const capX = head.x + (head.x - points[n - 2].x) * 0.45
  const capY = head.y + (head.y - points[n - 2].y) * 0.45
  let d = `M ${left[0].x} ${left[0].y}`
  d += half(left, 0, n - 1, 1)
  d += ` L ${left[n - 1].x} ${left[n - 1].y}`
  d += ` Q ${capX} ${capY} ${right[n - 1].x} ${right[n - 1].y}`
  d += half(right, n - 1, 0, -1)
  return `${d} L ${right[0].x} ${right[0].y} Z`
}

/* Paint-critical attributes stay on the element so a missed CSS rule can
   never resurface as invisible rings or a default black disc. */
function createRingCircle(cls: string, radius: number, dash: string, stroke: string, width: number) {
  const circle = document.createElementNS(SVG_NS, 'circle')
  circle.setAttribute('fill', 'none')
  circle.setAttribute('class', cls)
  circle.setAttribute('cx', String(BURST_CENTER))
  circle.setAttribute('cy', String(BURST_CENTER))
  circle.setAttribute('r', String(radius))
  circle.setAttribute('stroke', stroke)
  circle.setAttribute('stroke-width', String(width))
  circle.setAttribute('stroke-linecap', 'round')
  circle.setAttribute('stroke-dasharray', dash)
  return circle
}

function buildTriangleShard(
  cls: string,
  x: number,
  y: number,
  facing: number,
  size: number
) {
  const tipX = x + Math.cos(facing) * size
  const tipY = y + Math.sin(facing) * size
  const leftX = x + Math.cos(facing + 2.5) * size * 0.85
  const leftY = y + Math.sin(facing + 2.5) * size * 0.85
  const rightX = x + Math.cos(facing - 2.5) * size * 0.85
  const rightY = y + Math.sin(facing - 2.5) * size * 0.85
  const tri = document.createElementNS(SVG_NS, 'polygon')
  tri.setAttribute('class', cls)
  tri.setAttribute('points', `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`)
  return tri
}

const GLASS_ID_PREFIX = 'ba-glass'
let glassSeq = 0

/* Glass shard look: a translucent white→sky-blue wash oriented so the
   reflective end sits at the triangle's tip, plus a hairline white edge. */
function appendGlassDefs(svg: SVGElement, tipUp: boolean, idA: string, idB: string) {
  const defs = document.createElementNS(SVG_NS, 'defs')
  const make = (id: string, bright: number) => {
    const grad = document.createElementNS(SVG_NS, 'linearGradient')
    grad.setAttribute('id', id)
    grad.setAttribute('x1', '0.2')
    grad.setAttribute('y1', tipUp ? '0' : '1')
    grad.setAttribute('x2', '0.8')
    grad.setAttribute('y2', tipUp ? '1' : '0')
    const stops: Array<[string, string, number]> = [
      ['#ffffff', '0', bright],
      ['#d9f4ff', '0.45', bright - 0.12],
      ['#8fd2f0', '1', bright - 0.06],
    ]
    for (const [color, offset, opacity] of stops) {
      const stop = document.createElementNS(SVG_NS, 'stop')
      stop.setAttribute('offset', offset)
      stop.setAttribute('stop-color', color)
      stop.setAttribute('stop-opacity', String(opacity))
      grad.append(stop)
    }
    return grad
  }
  defs.append(make(idA, 0.96), make(idB, 0.78))
  svg.append(defs)
}

function glassEdge(tri: SVGElement) {
  tri.setAttribute('stroke', '#ffffff')
  tri.setAttribute('stroke-opacity', '0.55')
  tri.setAttribute('stroke-width', '0.6')
}

function buildBurst(palette: Palette): HTMLElement {
  const host = document.createElement('div')
  host.className = styles.burst

  const flash = document.createElement('span')
  flash.className = styles.flash
  flash.style.left = '0'
  flash.style.top = '0'
  flash.style.background = palette.flashBg
  flash.style.boxShadow = palette.flashShadow
  host.append(flash)

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${BURST_CENTER * 2} ${BURST_CENTER * 2}`)
  svg.setAttribute('width', String(BURST_CENTER * 2))
  svg.setAttribute('height', String(BURST_CENTER * 2))
  svg.setAttribute('class', styles.burstSvg)

  const rotation = random(0, 360)
  const group = document.createElementNS(SVG_NS, 'g')
  group.setAttribute('transform', `rotate(${rotation} ${BURST_CENTER} ${BURST_CENTER})`)
  const ringA = createRingCircle(styles.ringA, 28, '96 80', palette.ringA, 2.8)
  const ringB = createRingCircle(styles.ringB, 19, '42 82', palette.ringB, 1.6)
  /* Off-center small arc: the group rotation scatters its eccentric pivot so
     each burst reads hand-thrown instead of machine-drawn. */
  ringB.setAttribute('cx', '45')
  ringB.setAttribute('cy', '50')
  ringA.style.filter = palette.ringFilter
  group.append(ringA, ringB)
  svg.append(group)

  /* Triangle shards share one facing direction (all up or all down) but each
     may tilt away from it; slightly more shards sit outside the ring than
     inside, both spread evenly so they never crowd each other or the stroke. */
  const count = 3 + Math.floor(Math.random() * 3)
  const facingDeg = (Math.random() < 0.5 ? -90 : 90) + random(-32, 32)
  const facing = (facingDeg * Math.PI) / 180
  const baseAngle = random(0, 360)
  const gidA = `${GLASS_ID_PREFIX}-burst-${glassSeq++}-a`
  const gidB = `${GLASS_ID_PREFIX}-burst-${glassSeq++}-b`
  appendGlassDefs(svg, facingDeg < 0, gidA, gidB)
  const outsideCount = Math.max(2, Math.round(count * 0.65))
  const insideCount = count - outsideCount

  const spawnAt = (angleDeg: number, dist: number, size: number) => {
    const angle = (angleDeg * Math.PI) / 180
    const tri = buildTriangleShard(
      styles.tri,
      BURST_CENTER + Math.cos(angle) * dist,
      BURST_CENTER + Math.sin(angle) * dist,
      facing,
      size
    )
    tri.style.fill = `url(#${Math.random() < 0.6 ? gidA : gidB})`
    glassEdge(tri)
    /* Radial escape: each shard drifts outward along its spawn angle while
       fading, like debris flung off the dissolving ring. */
    const drift = random(10, 20)
    tri.style.setProperty('--tx', `${Math.cos(angle) * drift}px`)
    tri.style.setProperty('--ty', `${Math.sin(angle) * drift}px`)
    tri.style.animationDelay = `${random(0, 0.12)}s`
    svg.append(tri)
  }

  for (let i = 0; i < outsideCount; i++) {
    const angleDeg = baseAngle + (360 / outsideCount) * i + random(-18, 18)
    spawnAt(angleDeg, 28 * random(1.25, 1.55), Math.random() < 0.55 ? random(7, 11) : random(3.5, 5))
  }
  for (let i = 0; i < insideCount; i++) {
    const angleDeg = baseAngle + 180 / outsideCount + (360 / insideCount) * i + random(-18, 18)
    spawnAt(angleDeg, 28 * random(0.42, 0.66), Math.random() < 0.35 ? random(5, 8) : random(3, 4.5))
  }

  host.append(svg)
  return host
}

export function ClickHalo() {
  const trailSvgRef = useRef<SVGSVGElement>(null)
  const trailGlowPathRef = useRef<SVGPathElement>(null)
  const trailPathRef = useRef<SVGPathElement>(null)
  const shardsRef = useRef<SVGGElement>(null)
  const spawnsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!fine || reduced) return

    const trailSvg = trailSvgRef.current
    const trailPath = trailPathRef.current
    const trailGlowPath = trailGlowPathRef.current
    const shards = shardsRef.current
    const spawns = spawnsRef.current
    if (!trailSvg || !trailPath || !trailGlowPath || !shards || !spawns) return

    /* Theme follows the .dark/.light class next-themes toggles on <html> —
       this site's actual switch mechanism — with background luminance and
       the OS preference as fallbacks for any other setup. */
    const rgbOf = (el: HTMLElement) => {
      const bg = getComputedStyle(el).backgroundColor
      const parts = bg.match(/[\d.]+/g)?.map(Number) ?? []
      if (parts.length >= 3 && (parts.length < 4 || parts[3] > 0)) return parts.slice(0, 3)
      return null
    }
    const resolvePalette = () => {
      const classList = document.documentElement.classList
      if (classList.contains('dark')) return DARK
      if (classList.contains('light')) return LIGHT
      const rgb = rgbOf(document.body) ?? rgbOf(document.documentElement)
      if (rgb) {
        const [r, g, b] = rgb
        return 0.299 * r + 0.587 * g + 0.114 * b < 128 ? DARK : LIGHT
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? DARK : LIGHT
    }
    let palette = resolvePalette()
    const applyTrailTheme = () => {
      /* Comet bodies are filled ribbons; the halo comes from the inline
         drop-shadows on the core plus the blurred glow layer beneath. */
      trailPath.style.fill = palette.trailStroke
      trailPath.style.filter = palette.trailFilter
      trailGlowPath.style.fill = palette.trailStroke
    }
    const syncTheme = () => {
      const next = resolvePalette()
      if (next === palette) return
      palette = next
      applyTrailTheme()
      /* On-screen bursts and shards were painted with the previous palette.
         Drop them the moment the class flips so the transition never shows
         stale colors over the new background (they live 0.9s at most). */
      spawns.replaceChildren()
      shards.replaceChildren()
    }
    applyTrailTheme()
    /* Glass gradients for trail shards live once in the static trail SVG
       (re-created on re-init so StrictMode's double invoke can't duplicate). */
    trailSvg.querySelector('defs')?.remove()
    appendGlassDefs(trailSvg, true, `${GLASS_ID_PREFIX}-trail-a`, `${GLASS_ID_PREFIX}-trail-b`)
    const themeObserver = new MutationObserver(syncTheme)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    const timers = new Set<ReturnType<typeof setTimeout>>()
    const points: Point[] = []
    let shardDebt = SHARD_EVERY_DISTANCE

    const setSize = () => {
      trailSvg.setAttribute('width', String(window.innerWidth))
      trailSvg.setAttribute('height', String(window.innerHeight))
    }
    setSize()
    window.addEventListener('resize', setSize)

    const spawnShard = (x: number, y: number) => {
      const tri = buildTriangleShard(
        styles.shard,
        x + random(-14, 14),
        y + random(-14, 14),
        random(0, Math.PI * 2),
        Math.random() < 0.12 ? random(7, 10) : random(3, 5)
      )
      tri.style.fill = `url(#${GLASS_ID_PREFIX}-trail-${Math.random() < 0.6 ? 'a' : 'b'})`
      glassEdge(tri)
      tri.style.setProperty('--dx', `${random(-10, 10)}px`)
      tri.style.setProperty('--dy', `${random(-14, -4)}px`)
      tri.style.animationDelay = `${random(0, 0.08)}s`
      shards.append(tri)
      const timer = setTimeout(() => {
        tri.remove()
        timers.delete(timer)
      }, 1100)
      timers.add(timer)
    }

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const { clientX: x, clientY: y } = event
      const last = points[points.length - 1]
      const moved = last ? Math.hypot(x - last.x, y - last.y) : Infinity
      if (moved < TRAIL_MIN_DISTANCE) return
      points.push({ x, y, t: performance.now() })
      if (points.length > TRAIL_MAX_POINTS) points.shift()

      shardDebt += moved
      if (shardDebt >= SHARD_EVERY_DISTANCE) {
        shardDebt = 0
        /* Sparse cadence: a 65% roll per interval keeps the trail reading as
           an energy line rather than a particle emitter. */
        if (Math.random() < 0.65) spawnShard(x, y)
      }
    }

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      palette = resolvePalette()
      const burst = buildBurst(palette)
      burst.style.left = `${event.clientX}px`
      burst.style.top = `${event.clientY}px`
      spawns.append(burst)
      const timer = setTimeout(() => {
        burst.remove()
        timers.delete(timer)
      }, 900)
      timers.add(timer)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown)

    let raf = 0
    const tick = () => {
      const now = performance.now()
      while (points.length && now - points[0].t > TRAIL_LIFETIME_MS) points.shift()

      /* Hard length cap: once the polyline exceeds the limit the oldest
         segments are dropped, so the tail visibly retracts while moving. */
      let length = 0
      let cut = points.length - 1
      while (cut > 0) {
        const seg =
          Math.hypot(points[cut].x - points[cut - 1].x, points[cut].y - points[cut - 1].y)
        if (length + seg > TRAIL_MAX_LENGTH) break
        length += seg
        cut--
      }
      if (cut > 0) points.splice(0, cut)

      if (points.length >= 3) {
        const d = buildCometD(points)
        trailPath.setAttribute('d', d)
        trailGlowPath.setAttribute('d', d)
        trailPath.style.opacity = '0.92'
        trailGlowPath.style.opacity = '0.3'
      } else {
        trailPath.style.opacity = '0'
        trailGlowPath.style.opacity = '0'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('resize', setSize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      cancelAnimationFrame(raf)
      themeObserver.disconnect()
      for (const timer of timers) clearTimeout(timer)
      /* Only clear nodes this effect created; React-managed children survive
         so StrictMode's double invoke keeps pointing at live DOM. */
      shards.replaceChildren()
      spawns.replaceChildren()
    }
  }, [])

  return (
    <div className={styles.layer} aria-hidden="true">
      <svg ref={trailSvgRef} className={styles.trailSvg}>
        <path ref={trailGlowPathRef} className={styles.trailGlow} d="" />
        <path ref={trailPathRef} className={styles.trailPath} d="" />
        <g ref={shardsRef} />
      </svg>
      <div ref={spawnsRef} className={styles.spawns} />
    </div>
  )
}
