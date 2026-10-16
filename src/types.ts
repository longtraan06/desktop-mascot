import type { StateId } from '@/bot/states'
import type { ExpressionId } from '@/bot/expressions'

export type { StateId, ExpressionId }

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export interface MascotSettings {
  size: number
  shape: string
  color: string
  restExpression: ExpressionId
  autoSleepMinutes: number // 0 = disabled, 5, 10
  autoHideFullscreen: boolean
  startWithWindows: boolean
  globalShortcut: string
  bossKey: string
  lastX?: number
  lastY?: number
  monitorIndex?: number
  dockSide?: ScreenDockSide
}

export interface MascotSpeakOptions {
  text?: string
  audioSource?: HTMLAudioElement | AudioBuffer | string
  onProgress?: (token: string) => void
  onComplete?: () => void
}

export interface MascotListenOptions {
  onAudioData?: (amplitude: number) => void
  onStop?: () => void
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  isStreaming?: boolean
}

export type ScreenDockSide = 'left' | 'right' | 'bottom' | null
