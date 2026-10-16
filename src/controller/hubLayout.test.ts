import { describe, expect, it } from 'vitest'
import { layoutFrame } from './hubLayout'

const screen = { x: 0, y: 0, w: 1920, h: 1080 }

describe('layoutFrame', () => {
  it('khi đóng hub, cửa sổ bọc thân bot chứ không giữ 460px', () => {
    const frame = layoutFrame({
      botX: 400,
      botY: 500,
      botSize: 140,
      hubW: 0,
      hubH: 0,
      bubbleW: 0,
      bubbleH: 0,
      monitor: screen
    })
    expect(frame.window.w).toBeLessThan(200)
    expect(frame.window.h).toBeLessThan(200)
    expect(frame.anchorX + frame.window.x).toBeCloseTo(400, 5)
    expect(frame.anchorY + frame.window.y).toBeCloseTo(500, 5)
    expect(frame.side).toBeNull()
  })

  it('bot sát góc phải dưới thì hub lật lên và nằm trọn trong màn', () => {
    const frame = layoutFrame({
      botX: 1800,
      botY: 1000,
      botSize: 140,
      hubW: 336,
      hubH: 400,
      bubbleW: 0,
      bubbleH: 0,
      monitor: screen
    })
    expect(frame.side).toBe('above')
    expect(frame.hubX).toBeGreaterThanOrEqual(0)
    expect(frame.hubY).toBeGreaterThanOrEqual(0)
    expect(frame.hubX + 336).toBeLessThanOrEqual(1920)
    expect(frame.hubY + 400).toBeLessThanOrEqual(1080)
    expect(frame.anchorX + frame.window.x).toBeCloseTo(1800, 5)
    expect(frame.window.h).toBeGreaterThan(400)
  })

  it('bot sát góc trái trên thì hub không tràn ra ngoài màn', () => {
    const frame = layoutFrame({
      botX: 80,
      botY: 80,
      botSize: 140,
      hubW: 336,
      hubH: 400,
      bubbleW: 0,
      bubbleH: 0,
      monitor: screen
    })
    expect(frame.side === 'above' || frame.side === 'left').toBe(false)
    expect(frame.hubX).toBeGreaterThanOrEqual(0)
    expect(frame.hubY).toBeGreaterThanOrEqual(0)
    expect(frame.hubX + 336).toBeLessThanOrEqual(1920)
    expect(frame.hubY + 400).toBeLessThanOrEqual(1080)
  })

  it('bong bóng nằm trong khung, phía trên bot', () => {
    const frame = layoutFrame({
      botX: 400,
      botY: 500,
      botSize: 140,
      hubW: 0,
      hubH: 0,
      bubbleW: 220,
      bubbleH: 80,
      monitor: screen
    })
    expect(frame.window.y).toBeLessThan(500 - 70)
    expect(frame.window.y + frame.window.h).toBeGreaterThan(500)
  })
})
