import { describe, expect, it } from 'vitest'
import { AudioReactiveEngine, levelFromBins, smoothLevel } from './AudioReactiveEngine'

describe('AudioReactiveEngine', () => {
  it('đổi biên độ phổ thành mức 0..1', () => {
    expect(levelFromBins([])).toBe(0)
    expect(levelFromBins([0, 0, 0])).toBe(0)
    expect(levelFromBins([64, 64])).toBeCloseTo(0.5, 5)
    expect(levelFromBins([128, 255])).toBe(1)
  })

  it('làm mịn tiến về mục tiêu', () => {
    expect(smoothLevel(0, 1)).toBeCloseTo(0.25, 5)
    expect(smoothLevel(0.25, 1)).toBeCloseTo(0.4375, 5)
  })

  it('sample cập nhật mức và stopMicrophone trả về 0', () => {
    const engine = new AudioReactiveEngine()
    expect(engine.amplitude).toBe(0)
    expect(engine.smoothedAmplitude).toBe(0)

    engine.sample(new Uint8Array([128, 128, 128, 128]))
    expect(engine.amplitude).toBe(1)
    expect(engine.smoothedAmplitude).toBeCloseTo(0.25, 5)

    engine.sample(new Uint8Array([128, 128, 128, 128]))
    expect(engine.smoothedAmplitude).toBeCloseTo(0.4375, 5)

    engine.stopMicrophone()
    expect(engine.amplitude).toBe(0)
    expect(engine.smoothedAmplitude).toBe(0)
    engine.dispose()
  })
})
