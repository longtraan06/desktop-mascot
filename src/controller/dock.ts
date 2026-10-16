import type { ScreenDockSide } from '../types'

export const EDGE_PX = 30
export const PEEK_RATIO = 0.42

export interface MonitorRect {
  x: number
  y: number
  width: number
  height: number
}

export interface BotSpot {
  botX: number
  botY: number
  radius: number
}

export function monitorIndexAt(monitors: MonitorRect[], x: number, y: number): number {
  const hit = monitors.findIndex(
    (m) => x >= m.x && y >= m.y && x < m.x + m.width && y < m.y + m.height
  )
  if (hit >= 0) return hit
  let best = 0
  let bestD = Infinity
  monitors.forEach((m, i) => {
    const cx = Math.min(Math.max(x, m.x), m.x + m.width)
    const cy = Math.min(Math.max(y, m.y), m.y + m.height)
    const d = (cx - x) ** 2 + (cy - y) ** 2
    if (d < bestD) {
      best = i
      bestD = d
    }
  })
  return best
}

export function nearestDock(spot: BotSpot, monitor: MonitorRect, threshold = EDGE_PX): Exclude<ScreenDockSide, null> | null {
  const gaps: { side: Exclude<ScreenDockSide, null>; gap: number }[] = [
    { side: 'left', gap: spot.botX - spot.radius - monitor.x },
    { side: 'right', gap: monitor.x + monitor.width - (spot.botX + spot.radius) },
    { side: 'bottom', gap: monitor.y + monitor.height - (spot.botY + spot.radius) }
  ]
  const near = gaps.filter((g) => g.gap < threshold).sort((a, b) => a.gap - b.gap)
  return near[0]?.side ?? null
}

export function dockedBotPoint(side: Exclude<ScreenDockSide, null>, monitor: MonitorRect, spot: BotSpot): { x: number; y: number } {
  const peek = spot.radius * PEEK_RATIO
  const y = clamp(spot.botY, monitor.y + peek, monitor.y + monitor.height - peek)
  const x = clamp(spot.botX, monitor.x + peek, monitor.x + monitor.width - peek)
  if (side === 'left') return { x: monitor.x + peek, y }
  if (side === 'right') return { x: monitor.x + monitor.width - peek, y }
  return { x, y: monitor.y + monitor.height - peek }
}

export function revealedBotPoint(side: Exclude<ScreenDockSide, null>, monitor: MonitorRect, spot: BotSpot): { x: number; y: number } {
  const margin = spot.radius + 16
  const y = clamp(spot.botY, monitor.y + margin, monitor.y + monitor.height - margin)
  const x = clamp(spot.botX, monitor.x + margin, monitor.x + monitor.width - margin)
  if (side === 'left') return { x: monitor.x + margin, y }
  if (side === 'right') return { x: monitor.x + monitor.width - margin, y }
  return { x, y: monitor.y + monitor.height - margin }
}

export function windowOriginForBot(botX: number, botY: number, fromWindowX: number, fromWindowY: number) {
  return { x: botX - fromWindowX, y: botY - fromWindowY }
}

export function approachZone(
  side: Exclude<ScreenDockSide, null>,
  monitor: MonitorRect,
  botX: number,
  botY: number,
  radius: number
) {
  const reach = Math.max(72, radius * 1.6)
  const band = Math.max(radius * 3, 80)
  if (side === 'left') return { x: monitor.x, y: botY - band / 2, w: reach, h: band }
  if (side === 'right') return { x: monitor.x + monitor.width - reach, y: botY - band / 2, w: reach, h: band }
  return { x: botX - band / 2, y: monitor.y + monitor.height - reach, w: band, h: reach }
}

function clamp(v: number, lo: number, hi: number) {
  if (hi < lo) return (lo + hi) / 2
  return Math.min(hi, Math.max(lo, v))
}
