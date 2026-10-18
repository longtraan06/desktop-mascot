<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { clamp } from '@/bot/math'
import { SHAPE_BY_ID } from '@/bot/skins'
import { PITCH_MAX, YAW_MAX } from '@/ui/gaze'
import MascotBot from './components/MascotBot.vue'
import MascotHub from './components/MascotHub.vue'
import SpeechBubble from './components/SpeechBubble.vue'
import { mascot } from './controller/MascotController'
import { layoutFrame, type Rect } from './controller/hubLayout'
import { BOSS_SHORTCUT, HUB_SHORTCUT, webShortcut } from './controller/shortcuts'

const bubbleHost = ref<HTMLElement | null>(null)
const hubHost = ref<HTMLElement | null>(null)
const botHost = ref<HTMLElement | null>(null)
const hubLeft = ref(0)
const hubTop = ref(0)

const botStyle = computed(() => ({
  left: `${mascot.anchorX.value - mascot.size.value / 2}px`,
  top: `${mascot.anchorY.value - mascot.size.value / 2}px`
}))

const bubbleStyle = computed(() => ({
  left: `${mascot.anchorX.value}px`,
  top: `${mascot.anchorY.value - mascot.size.value / 2}px`,
  transform: 'translate(-50%, -100%)'
}))

let stopGaze: (() => void) | null = null
let rectTimer = 0
let fitting = false
let dropShortcuts: (() => Promise<void>) | null = null

function onWebPointerMove(e: PointerEvent) {
  if (mascot.isSleeping.value) return
  const demiW = Math.max(1, window.innerWidth / 2)
  const demiH = Math.max(1, window.innerHeight / 2)
  const nx = (e.clientX - demiW) / demiW
  const ny = (e.clientY - (window.innerHeight - mascot.size.value / 2 - 16)) / demiH
  mascot.updateGaze(
    clamp(nx * YAW_MAX, -YAW_MAX, YAW_MAX),
    clamp(-ny * PITCH_MAX, -PITCH_MAX, PITCH_MAX)
  )
}

function onWebKeyDown(e: KeyboardEvent) {
  const action = webShortcut(e)
  if (!action) return
  e.preventDefault()
  if (action === 'hub') mascot.toggleHub()
  else mascot.concealed.value = !mascot.concealed.value
}

function onOutsidePointer(e: PointerEvent) {
  if (!mascot.isHubOpen.value) return
  const node = e.target as Node | null
  if (node && (hubHost.value?.contains(node) || botHost.value?.contains(node))) return
  mascot.closeHub()
}

function zoneOf(el: HTMLElement | null, open: boolean) {
  if (!open || !el) return { open: false, x: 0, y: 0, w: 0, h: 0 }
  const box = el.getBoundingClientRect()
  if (box.width < 2 || box.height < 2) return { open: false, x: 0, y: 0, w: 0, h: 0 }
  return { open: true, x: box.x, y: box.y, w: box.width, h: box.height }
}

function panelSize(host: HTMLElement | null, fallback: { w: number; h: number }) {
  const child = host?.firstElementChild as HTMLElement | null
  if (!child || child.offsetWidth < 2 || child.offsetHeight < 2) return fallback
  return { w: Math.max(child.offsetWidth, fallback.w), h: Math.max(child.offsetHeight, fallback.h) }
}

async function pushProfile() {
  if (!window.__TAURI_INTERNALS__) return
  const { invoke } = await import('@tauri-apps/api/core')
  const radii = SHAPE_BY_ID.get(mascot.shape.value)?.radii ?? Array.from({ length: 64 }, () => 1)
  await invoke('set_bot_size', { size: mascot.size.value })
  await invoke('set_hit_profile', { radii })
}

async function pushRects() {
  if (!window.__TAURI_INTERNALS__) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('set_bubble_rect', zoneOf(bubbleHost.value, mascot.isBubbleVisible.value))
  await invoke('set_hub_rect', zoneOf(hubHost.value, mascot.isHubOpen.value))
}

function syncRectTimer() {
  const live = mascot.isHubOpen.value || mascot.isBubbleVisible.value
  if (live && !rectTimer) {
    rectTimer = window.setInterval(() => {
      void pushRects()
    }, 100)
    return
  }
  if (!live && rectTimer) {
    window.clearInterval(rectTimer)
    rectTimer = 0
  }
}

async function scenePoint() {
  if (!window.__TAURI_INTERNALS__) {
    return {
      x: mascot.anchorReady.value ? mascot.anchorX.value : window.innerWidth / 2,
      y: mascot.anchorReady.value ? mascot.anchorY.value : window.innerHeight - 16 - mascot.size.value / 2,
      scale: 1,
      monitor: { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight } as Rect
    }
  }
  const { availableMonitors, getCurrentWindow } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()
  const inner = await win.innerPosition()
  const innerSize = await win.innerSize()
  const scale = await win.scaleFactor()
  const x = mascot.anchorReady.value ? inner.x + mascot.anchorX.value * scale : inner.x + innerSize.width / 2
  const y = mascot.anchorReady.value
    ? inner.y + mascot.anchorY.value * scale
    : inner.y + innerSize.height - (16 + mascot.size.value / 2) * scale
  const monitors = await availableMonitors()
  const hit = monitors.find((m) => x >= m.position.x && y >= m.position.y && x < m.position.x + m.size.width && y < m.position.y + m.size.height) ?? monitors[0]
  const area = hit?.workArea
  const monitor: Rect = area
    ? { x: area.position.x, y: area.position.y, w: area.size.width, h: area.size.height }
    : { x: 0, y: 0, w: 1920, h: 1080 }
  return { x, y, scale, monitor }
}

async function fitScene(follow = true) {
  if (fitting || mascot.dragging.value) return
  fitting = true
  try {
    await nextTick()
    const spot = await scenePoint()
    const hub = mascot.isHubOpen.value ? panelSize(hubHost.value, { w: 336, h: 480 }) : { w: 0, h: 0 }
    const bubble = mascot.isBubbleVisible.value ? panelSize(bubbleHost.value, { w: 220, h: 72 }) : { w: 0, h: 0 }
    const frame = layoutFrame({
      botX: spot.x,
      botY: spot.y,
      botSize: mascot.size.value * spot.scale,
      hubW: hub.w * spot.scale,
      hubH: hub.h * spot.scale,
      bubbleW: bubble.w * spot.scale,
      bubbleH: bubble.h * spot.scale,
      monitor: spot.monitor
    })
    mascot.anchorX.value = frame.anchorX / spot.scale
    mascot.anchorY.value = frame.anchorY / spot.scale
    mascot.anchorReady.value = true
    hubLeft.value = (frame.hubX - frame.window.x) / spot.scale
    hubTop.value = (frame.hubY - frame.window.y) / spot.scale
    if (window.__TAURI_INTERNALS__) {
      const { invoke } = await import('@tauri-apps/api/core')
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const { PhysicalPosition, PhysicalSize } = await import('@tauri-apps/api/dpi')
      const win = getCurrentWindow()
      const [innerPos, outerPos, innerSize, outerSize] = await Promise.all([
        win.innerPosition(),
        win.outerPosition(),
        win.innerSize(),
        win.outerSize()
      ])
      await invoke('set_bot_anchor', { x: mascot.anchorX.value, y: mascot.anchorY.value, on: true })
      const pos = new PhysicalPosition(
        Math.round(frame.window.x + outerPos.x - innerPos.x),
        Math.round(frame.window.y + outerPos.y - innerPos.y)
      )
      mascot.windowX.value = pos.x
      mascot.windowY.value = pos.y
      mascot.windowKnown.value = true
      const size = new PhysicalSize(
        Math.max(1, Math.round(frame.window.w + outerSize.width - innerSize.width)),
        Math.max(1, Math.round(frame.window.h + outerSize.height - innerSize.height))
      )
      const growing = size.width * size.height >= innerSize.width * innerSize.height
      if (growing) {
        await win.setSize(size)
        await win.setPosition(pos)
      } else {
        await win.setPosition(pos)
        await win.setSize(size)
      }
      await pushRects()
    }
  } finally {
    fitting = false
  }
  if (follow && (mascot.isHubOpen.value || mascot.isBubbleVisible.value)) {
    requestAnimationFrame(() => {
      void fitScene(false)
    })
  }
}

async function startGaze() {
  if (!window.__TAURI_INTERNALS__) {
    window.addEventListener('pointermove', onWebPointerMove)
    await fitScene()
    return
  }
  await mascot.hydrate()
  await pushProfile()
  await fitScene()
  syncRectTimer()
  const { listen } = await import('@tauri-apps/api/event')
  const gaze = await listen<{ yaw: number; pitch: number; x: number; y: number }>('mascot-gaze', (event) => {
    if (!mascot.dragging.value) {
      mascot.windowX.value = event.payload.x
      mascot.windowY.value = event.payload.y
      mascot.windowKnown.value = true
    }
    if (mascot.isSleeping.value) return
    mascot.updateGaze(event.payload.yaw, event.payload.pitch)
  })
  const undock = await listen('mascot-undock', () => {
    void mascot.undock()
  })
  const idle = await listen('mascot-idle', () => {
    mascot.noteSystemIdle()
  })
  const activity = await listen('mascot-activity', () => {
    mascot.noteSystemActivity()
  })
  const dismiss = await listen('mascot-dismiss', () => {
    mascot.closeHub()
  })
  stopGaze = () => {
    gaze()
    undock()
    idle()
    activity()
    dismiss()
  }
}

async function registerGlobalShortcuts() {
  if (!window.__TAURI_INTERNALS__) {
    window.addEventListener('keydown', onWebKeyDown)
    mascot.shortcutError.value = ''
    return
  }
  const hooked: string[] = []
  try {
    const { register, unregister } = await import('@tauri-apps/plugin-global-shortcut')
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const win = getCurrentWebviewWindow()
    await register(HUB_SHORTCUT, () => {
      mascot.toggleHub()
    })
    hooked.push(HUB_SHORTCUT)
    await register(BOSS_SHORTCUT, async () => {
      const visible = await win.isVisible()
      if (visible) await win.hide()
      else {
        await win.show()
        await win.setFocus()
      }
    })
    hooked.push(BOSS_SHORTCUT)
    dropShortcuts = async () => {
      await Promise.all(hooked.map((id) => unregister(id)))
    }
    mascot.shortcutError.value = ''
  } catch (err) {
    mascot.shortcutError.value = err instanceof Error ? err.message : String(err)
    if (hooked.length) {
      const { unregister } = await import('@tauri-apps/plugin-global-shortcut')
      await Promise.all(hooked.map((id) => unregister(id).catch(() => {})))
    }
  }
}

watch(
  () => [mascot.shape.value, mascot.size.value] as const,
  () => {
    void pushProfile()
    void fitScene()
  }
)

watch(
  () => [mascot.isHubOpen.value, mascot.isBubbleVisible.value, mascot.bubbleText.value, mascot.hubTab.value] as const,
  async () => {
    await fitScene()
    syncRectTimer()
  }
)

onMounted(() => {
  window.addEventListener('pointerdown', onOutsidePointer)
  void startGaze()
  void registerGlobalShortcuts()
})

onBeforeUnmount(() => {
  stopGaze?.()
  void dropShortcuts?.()
  if (rectTimer) window.clearInterval(rectTimer)
  window.removeEventListener('pointermove', onWebPointerMove)
  window.removeEventListener('keydown', onWebKeyDown)
  window.removeEventListener('pointerdown', onOutsidePointer)
})
</script>

<template>
  <main v-show="!mascot.concealed.value" class="w-screen h-screen relative overflow-hidden bg-transparent select-none">
    <div ref="bubbleHost" class="absolute z-20 pointer-events-none" :style="bubbleStyle">
      <SpeechBubble
        :text="mascot.bubbleText.value"
        :visible="mascot.isBubbleVisible.value"
      />
    </div>

    <div ref="botHost" class="absolute z-10 pointer-events-auto" :style="botStyle">
      <MascotBot :size="mascot.size.value" />
    </div>

    <div ref="hubHost" class="absolute z-30 pointer-events-none" :style="{ left: hubLeft + 'px', top: hubTop + 'px' }">
      <MascotHub />
    </div>
  </main>
</template>
