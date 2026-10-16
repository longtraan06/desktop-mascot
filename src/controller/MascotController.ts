import { ref, reactive } from 'vue'
import { clamp } from '@/bot/math'
import { PITCH_MAX, YAW_MAX } from '@/ui/gaze'
import type {
  StateId,
  ExpressionId,
  MascotSettings,
  MascotSpeakOptions,
  MascotListenOptions,
  ScreenDockSide
} from '../types'
import { AudioReactiveEngine } from './AudioReactiveEngine'
import {
  approachZone,
  dockedBotPoint,
  monitorIndexAt,
  nearestDock,
  revealedBotPoint,
  windowOriginForBot,
  type MonitorRect
} from './dock'
import { PhysicsGesture } from './PhysicsGesture'

const DEFAULT_SETTINGS: MascotSettings = {
  size: 140,
  shape: 'cercle',
  color: 'encre',
  restExpression: 'neutre',
  autoSleepMinutes: 5,
  autoHideFullscreen: true,
  startWithWindows: false,
  globalShortcut: 'Ctrl+Shift+Space',
  bossKey: 'Ctrl+Shift+H'
}

const SIZE_MIN = 80
const SIZE_MAX = 220

export class MascotController {
  // Trạng thái hiển thị & animation
  public readonly state = ref<StateId>('idle')
  public readonly expression = ref<ExpressionId>('neutre')
  public readonly size = ref<number>(DEFAULT_SETTINGS.size)
  public readonly shape = ref<string>(DEFAULT_SETTINGS.shape)
  public readonly color = ref<string>(DEFAULT_SETTINGS.color)

  // Trạng thái hoạt động
  public readonly isSpeaking = ref(false)
  public readonly isListening = ref(false)
  public readonly isThinking = ref(false)
  public readonly isSleeping = ref(false)
  public readonly isDocked = ref(false)
  public readonly dockSide = ref<ScreenDockSide>(null)

  // Bong bóng & Hub tương tác
  public readonly isHubOpen = ref(false)
  public readonly hubTab = ref<'chat' | 'settings'>('chat')
  public readonly bubbleText = ref('')
  public readonly isBubbleVisible = ref(false)

  // Cấu hình người dùng
  public readonly settings = reactive<MascotSettings>({ ...DEFAULT_SETTINGS })

  // Động cơ âm thanh & vật lý
  public readonly audio = new AudioReactiveEngine()
  public readonly physics = new PhysicsGesture()

  public readonly anchorX = ref(0)
  public readonly anchorY = ref(0)
  public readonly anchorReady = ref(false)
  public readonly placeTick = ref(0)
  public readonly shortcutError = ref('')
  public readonly concealed = ref(false)
  public readonly dragging = ref(false)
  public readonly windowX = ref(0)
  public readonly windowY = ref(0)
  public readonly windowKnown = ref(false)
  public readonly lookTarget = ref<{ x: number; y: number } | null>(null)
  public readonly targetYaw = ref(0)
  public readonly targetPitch = ref(0)
  private currentYaw = 0
  private currentPitch = 0

  private stateTimeoutId: number | null = null
  private resolveTimedState: (() => void) | null = null
  private bubbleTimeoutId: number | null = null
  private inactivityTimerId: number | null = null
  private speakToken = 0
  private listenToken = 0
  private listenOptions: MascotListenOptions | undefined
  private cancelPlayback: (() => void) | null = null
  private objectUrl: string | null = null
  private audioDataRaf = 0

  constructor() {
    if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) this.loadSettings()
    this.resetInactivityTimer()
  }

  /* ------------------------------------------------ Điều khiển Trạng thái & Biểu cảm */

  public setState(nextState: StateId, duration?: number): Promise<void> {
    this.cancelTimedState()
    const pending = this.resolveTimedState
    this.resolveTimedState = null
    this.state.value = nextState
    if (nextState !== 'thinking') this.isThinking.value = false
    pending?.()

    if (!duration || duration <= 0) return Promise.resolve()

    return new Promise((resolve) => {
      this.resolveTimedState = resolve
      this.stateTimeoutId = window.setTimeout(() => {
        this.stateTimeoutId = null
        if (this.state.value === nextState) this.returnToRestPose()
        this.settleTimedState()
      }, duration * 1000)
    })
  }

  public setExpression(nextExpression: ExpressionId) {
    this.expression.value = nextExpression
  }

  public setSize(sizePx: number) {
    if (!Number.isFinite(sizePx)) return
    this.settings.size = clamp(Math.round(sizePx), SIZE_MIN, SIZE_MAX)
    this.saveSettings()
  }

  public setShape(shapeId: string) {
    if (!shapeId) return
    this.settings.shape = shapeId
    this.saveSettings()
  }

  public setColor(colorId: string) {
    if (!colorId) return
    this.settings.color = colorId
    this.saveSettings()
  }

  public resetToIdle() {
    if (this.isSpeaking.value) {
      this.speakToken++
      this.isSpeaking.value = false
      this.releasePlayback()
    }
    this.cancelListen()
    this.isThinking.value = false
    this.cancelTimedState()
    this.returnToRestPose()
    this.settleTimedState()
    this.resetInactivityTimer()
  }

  /* ------------------------------------------------ Tác vụ AI (Sẵn sàng cắm Backend) */

  public async speak(options: MascotSpeakOptions): Promise<void> {
    const token = ++this.speakToken
    this.cancelListen()
    this.isSpeaking.value = true
    this.isThinking.value = false
    this.isSleeping.value = false
    this.resetInactivityTimer()

    let error: unknown
    try {
      if (options.text) this.showBubble(options.text)
      const element = await this.resolveAudio(options.audioSource)
      if (token !== this.speakToken || !element) return
      this.audio.attachAudioElement(element)
      await this.playElement(element)
    } catch (err) {
      error = err
    } finally {
      this.endSpeak(token)
      options.onComplete?.()
    }
    if (error) throw error
  }

  public stopSpeaking() {
    if (!this.isSpeaking.value) return
    this.speakToken++
    this.isSpeaking.value = false
    this.releasePlayback()
    this.cancelTimedState()
    this.returnToRestPose()
    this.settleTimedState()
    this.resetInactivityTimer()
  }

  public async listen(options?: MascotListenOptions) {
    if (this.isSpeaking.value) this.stopSpeaking()
    const token = ++this.listenToken
    this.listenOptions = options
    this.isSpeaking.value = false
    this.isThinking.value = false

    try {
      await this.audio.startMicrophone()
    } catch {
      if (token !== this.listenToken) return
      this.listenOptions = undefined
      this.isListening.value = false
      options?.onStop?.()
      return
    }

    if (token !== this.listenToken) {
      this.audio.stopMicrophone()
      return
    }

    this.isListening.value = true
    this.isSleeping.value = false
    this.setExpression('attentif')
    await this.setState('wide')
    if (token !== this.listenToken) return
    this.resetInactivityTimer()
    this.pushAudioData()
    this.armAudioDataLoop()
  }

  public stopListening() {
    if (!this.isListening.value && this.listenOptions === undefined) return
    this.cancelListen()
    this.cancelTimedState()
    this.returnToRestPose()
    this.settleTimedState()
    this.resetInactivityTimer()
  }

  public think(taskPrompt?: string) {
    if (this.isSpeaking.value) this.stopSpeaking()
    this.cancelListen()
    this.isSleeping.value = false
    this.isThinking.value = true
    this.resetInactivityTimer()
    void this.setState('thinking')
    if (taskPrompt) this.showBubble(`⏳ ${taskPrompt}...`)
  }

  public stopThinking() {
    if (!this.isThinking.value) return
    this.isThinking.value = false
    this.hideBubble()
    this.cancelTimedState()
    this.returnToRestPose()
    this.settleTimedState()
    this.resetInactivityTimer()
  }

  /* ------------------------------------------------ Ngủ & Thức dậy (Inactivity) */

  public noteSystemIdle() {
    if (this.isSpeaking.value || this.isListening.value || this.isThinking.value) return
    if (!this.isSleeping.value) this.sleep()
  }

  public noteSystemActivity() {
    if (this.isSleeping.value) this.wakeUp()
  }

  public sleep() {
    this.isSleeping.value = true
    this.setExpression('somnolent')
    void this.setState('sleep')
  }

  public wakeUp() {
    if (!this.isSleeping.value) return
    this.isSleeping.value = false
    this.setExpression('surpris')
    void this.setState('wink', 1.2)
    this.resetInactivityTimer()
  }

  public resetInactivityTimer() {
    if (this.inactivityTimerId !== null) {
      window.clearTimeout(this.inactivityTimerId)
      this.inactivityTimerId = null
    }

    const busy = this.isSpeaking.value || this.isListening.value || this.isThinking.value || this.isSleeping.value
    if (this.onDesktop()) return
    if (this.settings.autoSleepMinutes > 0 && !busy) {
      this.inactivityTimerId = window.setTimeout(() => {
        this.sleep()
      }, this.settings.autoSleepMinutes * 60 * 1000)
    }
  }

  /* ------------------------------------------------ Phản xạ Cử chỉ Vật lý */

  public poke() {
    this.resetInactivityTimer()
    if (this.isSleeping.value) {
      this.wakeUp()
      return
    }
    this.setExpression('heureux')
    void this.setState('wink', 1.0)
  }

  public dock(side: ScreenDockSide) {
    this.dockSide.value = side
    this.isDocked.value = side !== null
    this.settings.dockSide = side
  }

  public async undock() {
    const side = this.dockSide.value
    this.dock(null)
    await this.pushDockZone(false)
    if (!this.onDesktop() || !side) {
      this.persist()
      return
    }
    try {
      const place = await readPlacement(this.size.value, this.anchorCss())
      const monitors = await readMonitors()
      const monitor = monitors[this.settings.monitorIndex ?? monitorIndexAt(monitors, place.botX, place.botY)]
      if (!monitor) return
      const bot = revealedBotPoint(side, monitor, place)
      const origin = windowOriginForBot(bot.x, bot.y, place.fromOuterX, place.fromOuterY)
      await placeWindow(origin.x, origin.y)
      await this.remember(origin.x, origin.y, monitors, bot.x, bot.y)
    } catch {
      this.persist()
    }
  }

  public async moveTo(x: number, y: number, monitorIndex?: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    if (monitorIndex !== undefined && !Number.isFinite(monitorIndex)) return
    this.settings.lastX = x
    this.settings.lastY = y
    if (monitorIndex !== undefined) this.settings.monitorIndex = monitorIndex
    this.persist()
    if (!this.onDesktop()) return
    try {
      const place = await readPlacement(this.size.value, this.anchorCss())
      const monitors = await readMonitors()
      let nextX = x
      let nextY = y
      if (monitors.length) {
        const botX = x + place.fromOuterX
        const botY = y + place.fromOuterY
        const index = monitorIndex ?? monitorIndexAt(monitors, botX, botY)
        const monitor = monitors[Math.min(index, monitors.length - 1)]!
        const onScreen = botX >= monitor.x && botY >= monitor.y && botX < monitor.x + monitor.width && botY < monitor.y + monitor.height
        if (!onScreen) {
          const bot = revealedBotPoint('left', monitor, { botX, botY, radius: place.radius })
          const origin = windowOriginForBot(
            Math.min(monitor.x + monitor.width - place.radius, Math.max(monitor.x + place.radius, botX)),
            Math.min(monitor.y + monitor.height - place.radius, Math.max(monitor.y + place.radius, botY)),
            place.fromOuterX,
            place.fromOuterY
          )
          nextX = origin.x
          nextY = origin.y
        }
        this.settings.monitorIndex = index
      }
      await placeWindow(nextX, nextY)
      this.settings.lastX = nextX
      this.settings.lastY = nextY
      this.persist()
    } catch {
      // Tọa độ đã lưu. Dịch cửa sổ thật sự là việc của lớp native khi có.
    }
  }

  public async settleAfterDrag() {
    if (!this.onDesktop()) return
    try {
      const place = await readPlacement(this.size.value, this.anchorCss())
      const monitors = await readMonitors()
      if (!monitors.length) {
        await this.remember(place.outerX, place.outerY, monitors, place.botX, place.botY)
        return
      }
      const index = monitorIndexAt(monitors, place.botX, place.botY)
      const monitor = monitors[index]!
      this.settings.monitorIndex = index
      const side = nearestDock(place, monitor, 30 * place.scale)
      if (!side) {
        this.dock(null)
        await this.pushDockZone(false)
        await this.remember(place.outerX, place.outerY, monitors, place.botX, place.botY)
        return
      }
      const bot = dockedBotPoint(side, monitor, place)
      const origin = windowOriginForBot(bot.x, bot.y, place.fromOuterX, place.fromOuterY)
      this.dock(side)
      await placeWindow(origin.x, origin.y)
      const zone = approachZone(side, monitor, bot.x, bot.y, place.radius)
      await this.pushDockZone(true, zone)
      await this.remember(origin.x, origin.y, monitors, bot.x, bot.y)
    } catch {
      // ignore
    }
  }

  public async hydrate() {
    if (!this.onDesktop()) {
      this.loadSettings()
      return
    }
    try {
      const { LazyStore } = await import('@tauri-apps/plugin-store')
      const store = new LazyStore('mascot-settings.json', { autoSave: 150 })
      const saved = await store.get<Partial<MascotSettings>>('mascot')
      if (saved) this.applySaved(saved)
      else {
        this.loadSettings()
        this.persist()
      }
    } catch {
      this.loadSettings()
    }
    if (Number.isFinite(this.settings.lastX) && Number.isFinite(this.settings.lastY)) {
      await this.moveTo(this.settings.lastX!, this.settings.lastY!, this.settings.monitorIndex)
    }
    if (this.settings.dockSide) {
      this.dock(this.settings.dockSide)
      await this.rearmDock()
    }
    await this.pushSystem()
    await this.syncAutostart()
  }

  public lookAt(globalX: number, globalY: number) {
    if (!Number.isFinite(globalX) || !Number.isFinite(globalY)) return
    this.lookTarget.value = { x: globalX, y: globalY }
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
      void this.lookAtScreen(globalX, globalY)
      return
    }
    const aim = this.gazeFromViewport(globalX, globalY)
    this.updateGaze(aim.yaw, aim.pitch)
  }

  public updateGaze(yaw: number, pitch: number) {
    this.targetYaw.value = yaw
    this.targetPitch.value = pitch
  }

  /**
   * Kịch bản ánh nhìn được BloubBot gọi trực tiếp ở mỗi frame của requestAnimationFrame
   */
  public getGaze = (_t: number) => {
    if (this.isSleeping.value) {
      return { yaw: 0, pitch: 0, mix: 0, spin: 0, wander: 1 }
    }
    this.currentYaw += (this.targetYaw.value - this.currentYaw) * 0.2
    this.currentPitch += (this.targetPitch.value - this.currentPitch) * 0.2

    return {
      yaw: this.currentYaw,
      pitch: this.currentPitch,
      mix: 1,
      spin: 0,
      wander: 0.15
    }
  }

  public dragStart(x = 0, y = 0) {
    this.dragging.value = true
    this.resetInactivityTimer()
    this.physics.startDrag(x, y)
  }

  public dragEnd() {
    this.dragging.value = false
    this.physics.endDrag()
    this.resetInactivityTimer()
    void this.settleAfterDrag()
  }

  /* ------------------------------------------------ Hub & Bong bóng Hội thoại */

  public openHub(tab: 'chat' | 'settings' = 'chat') {
    this.resetInactivityTimer()
    this.hubTab.value = tab
    this.isHubOpen.value = true
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('set_hub_open', { open: true })
      }).catch(() => {})
    }
  }

  public closeHub() {
    this.isHubOpen.value = false
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('set_hub_open', { open: false })
      }).catch(() => {})
    }
  }

  public toggleHub() {
    if (this.isHubOpen.value) this.closeHub()
    else this.openHub()
  }

  public showBubble(text: string, options?: { autoHideMs?: number }) {
    if (this.bubbleTimeoutId !== null) {
      window.clearTimeout(this.bubbleTimeoutId)
      this.bubbleTimeoutId = null
    }
    this.bubbleText.value = text
    this.isBubbleVisible.value = true

    if (options?.autoHideMs) {
      this.bubbleTimeoutId = window.setTimeout(() => {
        this.hideBubble()
      }, options.autoHideMs)
    }
  }

  public appendBubbleToken(token: string) {
    this.bubbleText.value += token
    this.isBubbleVisible.value = true
  }

  public hideBubble() {
    this.isBubbleVisible.value = false
    this.bubbleText.value = ''
  }

  /* ------------------------------------------------ Lưu & Nạp Cấu hình */

  public saveSettings() {
    this.persist()
    this.size.value = this.settings.size
    this.shape.value = this.settings.shape
    this.color.value = this.settings.color
    this.expression.value = this.settings.restExpression

    if (this.onDesktop()) {
      void this.pushSystem()
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('set_bot_size', { size: this.settings.size })
      }).catch(() => {})
    }
  }

  public loadSettings() {
    try {
      const raw = localStorage.getItem('bloub-mascot-settings')
      if (!raw) return
      this.applySaved(JSON.parse(raw) as Partial<MascotSettings>)
    } catch {
      // ignore
    }
  }

  /* ------------------------------------------------ Nội bộ */

  private onDesktop() {
    return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
  }

  private applySaved(parsed: Partial<MascotSettings>) {
    Object.assign(this.settings, parsed)
    if (Number.isFinite(this.settings.size)) {
      this.settings.size = clamp(Math.round(this.settings.size), SIZE_MIN, SIZE_MAX)
    }
    this.size.value = this.settings.size
    this.shape.value = this.settings.shape
    this.color.value = this.settings.color
    this.expression.value = this.settings.restExpression
    this.dock(this.settings.dockSide ?? null)
  }

  private persist() {
    const payload = { ...this.settings }
    if (!this.onDesktop()) {
      try {
        localStorage.setItem('bloub-mascot-settings', JSON.stringify(payload))
      } catch {
        // ignore
      }
      return
    }
    void import('@tauri-apps/plugin-store').then(async ({ LazyStore }) => {
      const store = new LazyStore('mascot-settings.json', { autoSave: 150 })
      await store.set('mascot', payload)
      await store.save()
    }).catch(() => {})
  }

  private async remember(x: number, y: number, monitors: MonitorRect[], botX: number, botY: number) {
    this.settings.lastX = x
    this.settings.lastY = y
    if (monitors.length) this.settings.monitorIndex = monitorIndexAt(monitors, botX, botY)
    this.placeTick.value += 1
    this.persist()
  }

  private anchorCss() {
    if (!this.anchorReady.value) return null
    return { x: this.anchorX.value, y: this.anchorY.value }
  }

  private async rearmDock() {
    const side = this.dockSide.value
    if (!side) return
    const place = await readPlacement(this.size.value, this.anchorCss())
    const monitors = await readMonitors()
    const monitor = monitors[this.settings.monitorIndex ?? monitorIndexAt(monitors, place.botX, place.botY)]
    if (!monitor) return
    await this.pushDockZone(true, approachZone(side, monitor, place.botX, place.botY, place.radius))
  }

  private async pushSystem() {
    if (!this.onDesktop()) return
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('set_idle_minutes', { minutes: this.settings.autoSleepMinutes })
    await invoke('set_auto_hide', { enabled: this.settings.autoHideFullscreen })
  }

  private async syncAutostart() {
    if (!this.onDesktop()) return
    try {
      const { isEnabled } = await import('@tauri-apps/plugin-autostart')
      const enabled = await isEnabled()
      if (this.settings.startWithWindows === enabled) return
      this.settings.startWithWindows = enabled
      this.persist()
    } catch {
      // ignore
    }
  }

  private async pushDockZone(on: boolean, zone?: { x: number; y: number; w: number; h: number }) {
    if (!this.onDesktop()) return
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('set_dock_zone', {
      on,
      x: zone?.x ?? 0,
      y: zone?.y ?? 0,
      w: zone?.w ?? 0,
      h: zone?.h ?? 0
    })
  }

  private returnToRestPose() {
    this.state.value = 'idle'
    this.expression.value = this.settings.restExpression
  }

  private cancelTimedState() {
    if (this.stateTimeoutId !== null) {
      window.clearTimeout(this.stateTimeoutId)
      this.stateTimeoutId = null
    }
  }

  private settleTimedState() {
    const resolve = this.resolveTimedState
    this.resolveTimedState = null
    resolve?.()
  }

  private endSpeak(token: number) {
    if (token !== this.speakToken) return
    this.isSpeaking.value = false
    this.releasePlayback()
    if (!this.isListening.value && !this.isThinking.value) {
      this.cancelTimedState()
      this.returnToRestPose()
      this.settleTimedState()
    }
    this.resetInactivityTimer()
  }

  private releasePlayback() {
    const cancel = this.cancelPlayback
    this.cancelPlayback = null
    this.revokeObjectUrl()
    cancel?.()
    this.audio.stopLoop()
  }

  private async resolveAudio(source: MascotSpeakOptions['audioSource']): Promise<HTMLAudioElement | null> {
    if (source == null) return null
    if (isAudioElement(source)) return source
    if (typeof source === 'string') {
      const url = source.trim()
      if (!url) return null
      return new Audio(url)
    }
    if (isAudioBuffer(source)) {
      this.revokeObjectUrl()
      const blob = audioBufferToWav(source)
      this.objectUrl = URL.createObjectURL(blob)
      return new Audio(this.objectUrl)
    }
    throw new TypeError('audioSource không được hỗ trợ')
  }

  private playElement(element: HTMLAudioElement): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      this.cancelPlayback = finish
      element.addEventListener('ended', finish, { once: true })
      element.addEventListener('error', finish, { once: true })
      try {
        const pending = element.play()
        if (pending && typeof pending.catch === 'function') pending.catch(finish)
      } catch {
        finish()
      }
    })
  }

  private revokeObjectUrl() {
    if (!this.objectUrl) return
    URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = null
  }

  private cancelListen() {
    if (!this.isListening.value && this.listenOptions === undefined) return
    this.listenToken++
    const onStop = this.listenOptions?.onStop
    this.listenOptions = undefined
    this.isListening.value = false
    this.stopAudioDataLoop()
    this.audio.stopMicrophone()
    onStop?.()
  }

  private pushAudioData() {
    this.listenOptions?.onAudioData?.(this.audio.smoothedAmplitude)
  }

  private armAudioDataLoop() {
    const loop = () => {
      if (!this.isListening.value) return
      this.pushAudioData()
      this.audioDataRaf = requestAnimationFrame(loop)
    }
    this.audioDataRaf = requestAnimationFrame(loop)
  }

  private stopAudioDataLoop() {
    if (!this.audioDataRaf) return
    cancelAnimationFrame(this.audioDataRaf)
    this.audioDataRaf = 0
  }

  private gazeFromViewport(globalX: number, globalY: number) {
    const width = Math.max(1, window.innerWidth)
    const height = Math.max(1, window.innerHeight)
    const nx = (globalX - width / 2) / (width / 2)
    const ny = (globalY - (height - this.size.value / 2 - 16)) / (height / 2)
    return {
      yaw: clamp(nx * YAW_MAX, -YAW_MAX, YAW_MAX),
      pitch: clamp(-ny * PITCH_MAX, -PITCH_MAX, PITCH_MAX)
    }
  }

  private async lookAtScreen(globalX: number, globalY: number) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      const pos = await win.outerPosition()
      const size = await win.outerSize()
      const scale = await win.scaleFactor()
      const radius = (this.size.value * scale) / 2
      const pad = 16 * scale
      const dx = globalX - (pos.x + size.width / 2)
      const dy = globalY - (pos.y + size.height - radius - pad)
      const nx = clamp(dx / (widthOf(scale)), -1.5, 1.5)
      const ny = clamp(dy / (heightOf(scale)), -1.5, 1.5)
      this.updateGaze(clamp(nx * YAW_MAX, -YAW_MAX, YAW_MAX), clamp(-ny * PITCH_MAX, -PITCH_MAX, PITCH_MAX))
    } catch {
      const aim = this.gazeFromViewport(globalX, globalY)
      this.updateGaze(aim.yaw, aim.pitch)
    }
  }
}

const VIEW = 316
const RAYON = 100

interface Placement {
  outerX: number
  outerY: number
  botX: number
  botY: number
  fromOuterX: number
  fromOuterY: number
  radius: number
  scale: number
}

async function readMonitors(): Promise<MonitorRect[]> {
  const { availableMonitors } = await import('@tauri-apps/api/window')
  const list = await availableMonitors()
  return list.map((m) => ({
    x: m.position.x,
    y: m.position.y,
    width: m.size.width,
    height: m.size.height
  }))
}

async function readPlacement(size: number, anchor: { x: number; y: number } | null): Promise<Placement> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()
  const outer = await win.outerPosition()
  const inner = await win.innerPosition()
  const innerSize = await win.innerSize()
  const scale = await win.scaleFactor()
  const botX = inner.x + (anchor ? anchor.x * scale : innerSize.width / 2)
  const botY = inner.y + (anchor ? anchor.y * scale : innerSize.height - (16 + size / 2) * scale)
  return {
    outerX: outer.x,
    outerY: outer.y,
    botX,
    botY,
    fromOuterX: botX - outer.x,
    fromOuterY: botY - outer.y,
    radius: (RAYON / VIEW) * size * scale,
    scale
  }
}

async function placeWindow(x: number, y: number) {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const { PhysicalPosition } = await import('@tauri-apps/api/dpi')
  await getCurrentWindow().setPosition(new PhysicalPosition(Math.round(x), Math.round(y)))
}

function widthOf(scale: number) {
  return Math.max(1, window.screen?.width || window.innerWidth) * scale
}

function heightOf(scale: number) {
  return Math.max(1, window.screen?.height || window.innerHeight) * scale
}

function isAudioElement(value: unknown): value is HTMLAudioElement {
  return typeof HTMLAudioElement !== 'undefined' && value instanceof HTMLAudioElement
}

function isAudioBuffer(value: unknown): value is AudioBuffer {
  if (!value || typeof value !== 'object') return false
  const buffer = value as AudioBuffer
  return typeof buffer.getChannelData === 'function'
    && typeof buffer.sampleRate === 'number'
    && typeof buffer.numberOfChannels === 'number'
    && typeof buffer.length === 'number'
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels
  const rate = buffer.sampleRate
  const frames = buffer.length
  if (channels < 1 || frames < 1 || !Number.isFinite(rate) || rate <= 0) {
    throw new TypeError('AudioBuffer không hợp lệ')
  }
  const tracks: Float32Array[] = []
  for (let c = 0; c < channels; c++) tracks.push(buffer.getChannelData(c))
  const blockAlign = channels * 2
  const dataSize = frames * blockAlign
  const out = new ArrayBuffer(44 + dataSize)
  const view = new DataView(out)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = clamp(tracks[c]![i] ?? 0, -1, 1)
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([out], { type: 'audio/wav' })
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

export const mascot = new MascotController()
