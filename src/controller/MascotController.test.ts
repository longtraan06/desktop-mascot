// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MascotController } from './MascotController'

describe('MascotController', () => {
  let mascot: MascotController

  beforeEach(() => {
    localStorage.clear()
    mascot = new MascotController()
  })

  it('khởi tạo với các giá trị mặc định chuẩn xác', () => {
    expect(mascot.state.value).toBe('idle')
    expect(mascot.expression.value).toBe('neutre')
    expect(mascot.size.value).toBe(140)
    expect(mascot.isSpeaking.value).toBe(false)
    expect(mascot.isListening.value).toBe(false)
    expect(mascot.isSleeping.value).toBe(false)
    expect(mascot.isHubOpen.value).toBe(false)
  })

  it('chuyển đổi trạng thái và cảm xúc', async () => {
    await mascot.setState('orbit')
    expect(mascot.state.value).toBe('orbit')

    mascot.setExpression('curieux')
    expect(mascot.expression.value).toBe('curieux')

    mascot.resetToIdle()
    expect(mascot.state.value).toBe('idle')
    expect(mascot.expression.value).toBe('neutre')
  })

  it('chế độ ngủ và đánh thức', () => {
    mascot.sleep()
    expect(mascot.isSleeping.value).toBe(true)
    expect(mascot.state.value).toBe('sleep')
    expect(mascot.expression.value).toBe('somnolent')

    mascot.wakeUp()
    expect(mascot.isSleeping.value).toBe(false)
    expect(mascot.expression.value).toBe('surpris')
    expect(mascot.state.value).toBe('wink')
  })

  it('phản xạ Poke khi tương tác', () => {
    mascot.poke()
    expect(mascot.expression.value).toBe('heureux')
    expect(mascot.state.value).toBe('wink')
  })

  it('quản lý Hub và bong bóng hội thoại', () => {
    mascot.openHub('settings')
    expect(mascot.isHubOpen.value).toBe(true)
    expect(mascot.hubTab.value).toBe('settings')

    mascot.closeHub()
    expect(mascot.isHubOpen.value).toBe(false)

    mascot.showBubble('Xin chào!')
    expect(mascot.isBubbleVisible.value).toBe(true)
    expect(mascot.bubbleText.value).toBe('Xin chào!')

    mascot.appendBubbleToken(' Thêm chữ')
    expect(mascot.bubbleText.value).toBe('Xin chào! Thêm chữ')

    mascot.hideBubble()
    expect(mascot.isBubbleVisible.value).toBe(false)
    expect(mascot.bubbleText.value).toBe('')
  })

  it('lưu và khôi phục cài đặt qua LocalStorage', () => {
    mascot.settings.size = 180
    mascot.settings.shape = 'carre'
    mascot.settings.color = 'ambre'
    mascot.saveSettings()

    const newMascot = new MascotController()
    expect(newMascot.size.value).toBe(180)
    expect(newMascot.shape.value).toBe('carre')
    expect(newMascot.color.value).toBe('ambre')
  })

  it('speak không audio thì tắt trạng thái và gọi onComplete', async () => {
    const onComplete = vi.fn()
    await mascot.speak({ text: 'xin chào', onComplete })
    expect(mascot.isSpeaking.value).toBe(false)
    expect(mascot.bubbleText.value).toBe('xin chào')
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('speak phát audio rồi kết thúc, kể cả AudioBuffer và url', async () => {
    vi.spyOn(mascot.audio, 'attachAudioElement').mockImplementation(() => {})
    vi.spyOn(HTMLAudioElement.prototype, 'play').mockImplementation(function (this: HTMLAudioElement) {
      queueMicrotask(() => this.dispatchEvent(new Event('ended')))
      return Promise.resolve()
    })
    try {
      const onElement = vi.fn()
      await mascot.speak({ audioSource: new Audio(), onComplete: onElement })
      expect(onElement).toHaveBeenCalledOnce()
      expect(mascot.isSpeaking.value).toBe(false)

      const onUrl = vi.fn()
      await mascot.speak({ audioSource: 'https://example.com/voice.mp3', onComplete: onUrl })
      expect(onUrl).toHaveBeenCalledOnce()
      expect(mascot.isSpeaking.value).toBe(false)

      const onBuffer = vi.fn()
      await mascot.speak({
        audioSource: {
          length: 2,
          numberOfChannels: 1,
          sampleRate: 8000,
          getChannelData: () => new Float32Array([0, 0.5])
        } as unknown as AudioBuffer,
        onComplete: onBuffer
      })
      expect(onBuffer).toHaveBeenCalledOnce()
      expect(mascot.isSpeaking.value).toBe(false)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('speak từ chối audioSource lạ nhưng vẫn kết thúc', async () => {
    const onComplete = vi.fn()
    await expect(mascot.speak({ audioSource: 1 as never, onComplete })).rejects.toThrow(TypeError)
    expect(onComplete).toHaveBeenCalledOnce()
    expect(mascot.isSpeaking.value).toBe(false)
  })

  it('không ngủ khi đang nói', async () => {
    vi.useFakeTimers()
    try {
      const m = new MascotController()
      m.settings.autoSleepMinutes = 5
      const element = new Audio()
      vi.spyOn(m.audio, 'attachAudioElement').mockImplementation(() => {})
      vi.spyOn(element, 'play').mockReturnValue(new Promise(() => {}))
      const pending = m.speak({ audioSource: element })
      expect(m.isSpeaking.value).toBe(true)
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      expect(m.isSleeping.value).toBe(false)
      m.stopSpeaking()
      await pending
    } finally {
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  })

  it('listen lỗi thì không ở trạng thái nghe và gọi onStop', async () => {
    vi.spyOn(mascot.audio, 'startMicrophone').mockRejectedValue(new Error('denied'))
    const onStop = vi.fn()
    await mascot.listen({ onStop })
    expect(mascot.isListening.value).toBe(false)
    expect(mascot.state.value).toBe('idle')
    expect(onStop).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
  })

  it('listen thành công thì đẩy biên độ và stopListening gọi onStop', async () => {
    vi.spyOn(mascot.audio, 'startMicrophone').mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream)
    mascot.audio.smoothedAmplitude = 0.42
    const samples: number[] = []
    const onStop = vi.fn()
    await mascot.listen({
      onAudioData: (amplitude) => samples.push(amplitude),
      onStop
    })
    expect(mascot.isListening.value).toBe(true)
    expect(mascot.state.value).toBe('wide')
    expect(samples[0]).toBe(0.42)
    mascot.stopListening()
    expect(mascot.isListening.value).toBe(false)
    expect(mascot.state.value).toBe('idle')
    expect(onStop).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
  })

  it('setState có thời hạn resolve khi bị cắt', async () => {
    let settled = false
    const first = mascot.setState('wink', 5).then(() => {
      settled = true
    })
    await mascot.setState('orbit')
    await first
    expect(settled).toBe(true)
    expect(mascot.state.value).toBe('orbit')

    let cut = false
    const second = mascot.setState('play', 5).then(() => {
      cut = true
    })
    mascot.resetToIdle()
    await second
    expect(cut).toBe(true)
    expect(mascot.state.value).toBe('idle')
  })

  it('hết poke thì trả biểu cảm nghỉ', async () => {
    vi.useFakeTimers()
    try {
      const m = new MascotController()
      m.settings.restExpression = 'timide'
      m.poke()
      expect(m.expression.value).toBe('heureux')
      expect(m.state.value).toBe('wink')
      await vi.advanceTimersByTimeAsync(1000)
      expect(m.state.value).toBe('idle')
      expect(m.expression.value).toBe('timide')
    } finally {
      vi.useRealTimers()
    }
  })

  it('think có điểm kết thúc', () => {
    mascot.think('xử lý')
    expect(mascot.isThinking.value).toBe(true)
    expect(mascot.state.value).toBe('thinking')
    mascot.setState('play')
    expect(mascot.isThinking.value).toBe(false)
    mascot.think('tiếp')
    mascot.stopThinking()
    expect(mascot.isThinking.value).toBe(false)
    expect(mascot.state.value).toBe('idle')
    expect(mascot.isBubbleVisible.value).toBe(false)
  })

  it('setSize, setShape, moveTo, lookAt, dock', async () => {
    mascot.setSize(80)
    expect(mascot.size.value).toBe(80)
    mascot.setSize(999)
    expect(mascot.size.value).toBe(220)
    mascot.setSize(Number.NaN)
    expect(mascot.size.value).toBe(220)
    mascot.setShape('goutte')
    mascot.setColor('bleu')
    expect(mascot.shape.value).toBe('goutte')
    expect(mascot.color.value).toBe('bleu')

    await mascot.moveTo(Number.NaN, 1)
    expect(mascot.settings.lastX).toBeUndefined()
    await mascot.moveTo(12, 34, 1)
    expect(mascot.settings.lastX).toBe(12)
    expect(mascot.settings.lastY).toBe(34)
    expect(mascot.settings.monitorIndex).toBe(1)
    const restored = new MascotController()
    expect(restored.settings.lastX).toBe(12)

    window.innerWidth = 200
    window.innerHeight = 200
    mascot.lookAt(200, 0)
    expect(mascot.lookTarget.value).toEqual({ x: 200, y: 0 })
    expect(mascot.targetYaw.value).toBeGreaterThan(0)
    expect(mascot.targetYaw.value).toBeLessThanOrEqual(16)
    mascot.lookAt(Number.NaN, 0)
    expect(mascot.lookTarget.value).toEqual({ x: 200, y: 0 })

    mascot.dragStart(0, 0)
    mascot.physics.updateDrag(80, 0)
    expect(mascot.physics.computeTransform().scaleX).toBeGreaterThan(1)
    mascot.dragEnd()
    mascot.dock('left')
    mascot.undock()
    expect(mascot.isDocked.value).toBe(false)
    expect(mascot.dockSide.value).toBeNull()
  })
})
