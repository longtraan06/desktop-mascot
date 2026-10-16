import { describe, expect, it } from 'vitest'
import {
  approachZone,
  dockedBotPoint,
  monitorIndexAt,
  nearestDock,
  PEEK_RATIO,
  revealedBotPoint,
  windowOriginForBot
} from './dock'

const primary = { x: 0, y: 0, width: 1920, height: 1080 }
const secondary = { x: 1920, y: 0, width: 1920, height: 1080 }

describe('dock', () => {
  it('chọn màn hình đang chứa bot, không phải cửa sổ', () => {
    expect(monitorIndexAt([primary, secondary], 2100, 400)).toBe(1)
    expect(monitorIndexAt([primary, secondary], 400, 400)).toBe(0)
  })

  it('không hít khi chỉ mép cửa sổ chạm biên còn thân còn ở giữa', () => {
    const radius = 44
    const botX = 230
    expect(nearestDock({ botX, botY: 900, radius }, primary)).toBeNull()
  })

  it('hít mép trái phải đáy của đúng màn hình khi thân cách dưới 30px', () => {
    const radius = 40
    expect(nearestDock({ botX: 50, botY: 500, radius }, primary)).toBe('left')
    expect(nearestDock({ botX: 1900, botY: 500, radius }, primary)).toBe('right')
    expect(nearestDock({ botX: 800, botY: 1060, radius }, primary)).toBe('bottom')
    expect(nearestDock({ botX: 1960, botY: 500, radius }, secondary)).toBe('left')
    expect(nearestDock({ botX: 800, botY: 500, radius }, primary)).toBeNull()
  })

  it('peek để hơn nửa thân ra ngoài và undock kéo thân vào lại', () => {
    const spot = { botX: 20, botY: 700, radius: 100 }
    const docked = dockedBotPoint('left', primary, spot)
    expect(docked.x).toBeCloseTo(100 * PEEK_RATIO, 5)
    expect(docked.x).toBeLessThan(spot.radius / 2)
    const shown = revealedBotPoint('left', primary, spot)
    expect(shown.x).toBe(spot.radius + 16)
    const origin = windowOriginForBot(docked.x, docked.y, 230, 400)
    expect(origin.x).toBeCloseTo(docked.x - 230, 5)
    expect(origin.y).toBeCloseTo(docked.y - 400, 5)
  })

  it('vùng rê chuột bám mép màn, không phủ cả cửa sổ', () => {
    const zone = approachZone('left', secondary, 1960, 500, 40)
    expect(zone.x).toBe(1920)
    expect(zone.w).toBeLessThan(200)
    expect(zone.y).toBeLessThan(500)
    expect(zone.y + zone.h).toBeGreaterThan(500)
  })
})
