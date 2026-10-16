export type HubSide = 'left' | 'right' | 'above' | 'below'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface SceneFrame {
  side: HubSide | null
  window: Rect
  anchorX: number
  anchorY: number
  hubX: number
  hubY: number
}

const PAD = 12
const GAP = 10
const ORDER: HubSide[] = ['above', 'right', 'left', 'below']

export function layoutFrame(input: {
  botX: number
  botY: number
  botSize: number
  hubW: number
  hubH: number
  bubbleW: number
  bubbleH: number
  monitor: Rect
}): SceneFrame {
  const bot = boxAround(input.botX, input.botY, input.botSize)
  const bubble = input.bubbleH > 2
    ? slideInto(placeBubble(bot, input.bubbleW, input.bubbleH), input.monitor, 'x')
    : null
  const hub = input.hubW > 2 && input.hubH > 2
    ? chooseHub(bot, input.hubW, input.hubH, input.monitor)
    : null
  const window = union([expand(bot, PAD), bubble, hub ? expand(hub.rect, PAD) : null])
  return {
    side: hub?.side ?? null,
    window,
    anchorX: input.botX - window.x,
    anchorY: input.botY - window.y,
    hubX: hub?.rect.x ?? 0,
    hubY: hub?.rect.y ?? 0
  }
}

function chooseHub(bot: Rect, hubW: number, hubH: number, monitor: Rect) {
  const placed = ORDER.map((side) => ({ side, rect: slideInto(placeHub(side, bot, hubW, hubH), monitor, axisOf(side)) }))
  const clear = placed.find((item) => contains(monitor, item.rect) && overlap(bot, item.rect) <= 1)
  if (clear) return clear
  const fitted = placed.find((item) => contains(monitor, item.rect))
  if (fitted) return fitted
  return placed.sort((a, b) => overlap(monitor, b.rect) - overlap(monitor, a.rect))[0] ?? null
}

function placeHub(side: HubSide, bot: Rect, hubW: number, hubH: number): Rect {
  if (side === 'right') return { x: bot.x + bot.w + GAP, y: bot.y + bot.h / 2 - hubH / 2, w: hubW, h: hubH }
  if (side === 'left') return { x: bot.x - GAP - hubW, y: bot.y + bot.h / 2 - hubH / 2, w: hubW, h: hubH }
  if (side === 'above') return { x: bot.x + bot.w / 2 - hubW / 2, y: bot.y - GAP - hubH, w: hubW, h: hubH }
  return { x: bot.x + bot.w / 2 - hubW / 2, y: bot.y + bot.h + GAP, w: hubW, h: hubH }
}

function placeBubble(bot: Rect, w: number, h: number): Rect {
  return { x: bot.x + bot.w / 2 - w / 2, y: bot.y - GAP - h, w, h }
}

function axisOf(side: HubSide): 'x' | 'y' {
  return side === 'left' || side === 'right' ? 'y' : 'x'
}

function slideInto(rect: Rect, monitor: Rect, axis: 'x' | 'y'): Rect {
  const next = { ...rect }
  if (axis === 'x') next.x = clamp(next.x, monitor.x, monitor.x + monitor.w - next.w)
  else next.y = clamp(next.y, monitor.y, monitor.y + monitor.h - next.h)
  return next
}

function boxAround(cx: number, cy: number, size: number): Rect {
  return { x: cx - size / 2, y: cy - size / 2, w: size, h: size }
}

function expand(rect: Rect, pad: number): Rect {
  return { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 }
}

function union(boxes: Array<Rect | null>): Rect {
  const live = boxes.filter((box): box is Rect => !!box)
  const x = Math.min(...live.map((box) => box.x))
  const y = Math.min(...live.map((box) => box.y))
  const r = Math.max(...live.map((box) => box.x + box.w))
  const b = Math.max(...live.map((box) => box.y + box.h))
  return { x, y, w: r - x, h: b - y }
}

function contains(outer: Rect, inner: Rect) {
  return inner.x >= outer.x - 0.5
    && inner.y >= outer.y - 0.5
    && inner.x + inner.w <= outer.x + outer.w + 0.5
    && inner.y + inner.h <= outer.y + outer.h + 0.5
}

function overlap(outer: Rect, inner: Rect) {
  const w = Math.min(outer.x + outer.w, inner.x + inner.w) - Math.max(outer.x, inner.x)
  const h = Math.min(outer.y + outer.h, inner.y + inner.h) - Math.max(outer.y, inner.y)
  if (w <= 0 || h <= 0) return 0
  return w * h
}

function clamp(v: number, lo: number, hi: number) {
  if (hi < lo) return (lo + hi) / 2
  return Math.min(hi, Math.max(lo, v))
}
