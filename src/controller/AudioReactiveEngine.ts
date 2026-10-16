/**
 * AudioReactiveEngine
 * Phân tích âm thanh theo thời gian thực (Web Audio API)
 * Dùng để điều biến nhịp thở của Mascot khi Bot nói (TTS) hoặc khi nghe người dùng (Mic)
 */
export class AudioReactiveEngine {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private dataArray: Uint8Array<ArrayBuffer> | null = null
  private micStream: MediaStream | null = null
  private sourceNode: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null
  
  public amplitude = 0 // 0.0 -> 1.0
  public smoothedAmplitude = 0
  private isRunning = false
  private rafId = 0

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AudioCtx()
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  /**
   * Kết nối tới một phần tử HTMLAudioElement (khi phát TTS)
   */
  public attachAudioElement(element: HTMLAudioElement) {
    const ctx = this.getContext()
    this.cleanupNodes()

    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 256
    this.analyser.smoothingTimeConstant = 0.8
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)

    this.sourceNode = ctx.createMediaElementSource(element)
    this.sourceNode.connect(this.analyser)
    this.analyser.connect(ctx.destination)

    this.startLoop()
  }

  /**
   * Lắng nghe trực tiếp từ Micro của người dùng
   */
  public async startMicrophone(): Promise<MediaStream> {
    const ctx = this.getContext()
    this.cleanupNodes()

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.micStream = stream

    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 256
    this.analyser.smoothingTimeConstant = 0.7
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)

    this.sourceNode = ctx.createMediaStreamSource(stream)
    this.sourceNode.connect(this.analyser)

    this.startLoop()
    return stream
  }

  public stopMicrophone() {
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop())
      this.micStream = null
    }
    this.stopLoop()
    this.amplitude = 0
    this.smoothedAmplitude = 0
  }

  private startLoop() {
    if (this.isRunning) return
    this.isRunning = true

    const update = () => {
      if (!this.isRunning || !this.analyser || !this.dataArray) return

      this.analyser.getByteFrequencyData(this.dataArray)
      this.sample(this.dataArray)

      this.rafId = requestAnimationFrame(update)
    }

    this.rafId = requestAnimationFrame(update)
  }

  public sample(bins: ArrayLike<number>) {
    this.amplitude = levelFromBins(bins)
    this.smoothedAmplitude = smoothLevel(this.smoothedAmplitude, this.amplitude)
  }

  public stopLoop() {
    this.isRunning = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
  }

  private cleanupNodes() {
    this.stopLoop()
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect()
      } catch {
        // ignore
      }
      this.sourceNode = null
    }
  }

  public dispose() {
    this.stopMicrophone()
    this.cleanupNodes()
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close()
      this.ctx = null
    }
  }
}

export function levelFromBins(bins: ArrayLike<number>): number {
  if (!bins.length) return 0
  let sum = 0
  for (let i = 0; i < bins.length; i++) sum += bins[i] ?? 0
  return Math.min(1, sum / bins.length / 128)
}

export function smoothLevel(current: number, target: number): number {
  return current + (target - current) * 0.25
}
