import { describe, it, expect, vi } from 'vitest'
import { bodyTransform, PhysicsGesture } from './PhysicsGesture'

describe('PhysicsGesture', () => {
  it('khởi tạo với các giá trị mặc định', () => {
    const physics = new PhysicsGesture()
    const transform = physics.computeTransform()
    expect(transform.scaleX).toBe(1)
    expect(transform.scaleY).toBe(1)
    expect(transform.rotationDeg).toBe(0)
    expect(physics.dockSide).toBeNull()
  })

  it('tính toán squash & stretch khi kéo thả', () => {
    const physics = new PhysicsGesture()
    physics.startDrag(100, 100)
    physics.updateDrag(150, 120)

    const transform = physics.computeTransform()
    expect(transform.scaleX).toBeGreaterThan(1) // Stretch
    expect(transform.scaleY).toBeLessThan(1)    // Squash
    expect(transform.rotationDeg).toBeDefined()
  })

  it('nhận diện chính xác mép màn hình khi hít mép (Edge Docking)', () => {
    const physics = new PhysicsGesture()
    
    // Mép trái (x = 10px < 35px)
    expect(physics.checkDockEdge(10, 500, 1920, 1080, 140)).toBe('left')

    // Mép phải (x = 1800px, bot 140px -> 1940px >= 1920 - 35)
    expect(physics.checkDockEdge(1800, 500, 1920, 1080, 140)).toBe('right')

    // Mép đáy
    expect(physics.checkDockEdge(500, 1000, 1920, 1080, 140)).toBe('bottom')

    // Ở giữa màn hình (không hít mép)
    expect(physics.checkDockEdge(500, 500, 1920, 1080, 140)).toBeNull()
  })

  it('nảy sau khi thả và nhịp thở nhân thêm vào thân', () => {
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    try {
      const physics = new PhysicsGesture()
      physics.startDrag(0, 0)
      physics.updateDrag(40, 0)
      const stretched = physics.computeTransform()
      expect(stretched.scaleX).toBeGreaterThan(1)
      expect(stretched.rotationDeg).toBe(0)
      physics.endDrag()
      now = 1062.5
      expect(physics.computeTransform().scaleX).toBeGreaterThan(1.05)
    } finally {
      vi.restoreAllMocks()
    }

    const idle = { scaleX: 1, scaleY: 1, rotationDeg: 0, offsetX: 0, offsetY: 0 }
    expect(bodyTransform(idle, 0)).toBe('translate(0px, 0px) rotate(0deg) scale(1, 1)')
    const pulsed = bodyTransform(idle, 1).match(/scale\(([^,]+), ([^)]+)\)/)
    expect(Number(pulsed?.[1])).toBeCloseTo(1.12, 5)
    expect(Number(pulsed?.[2])).toBeCloseTo(1.12, 5)
  })
})
