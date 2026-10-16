<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import BloubBot from '@/components/BloubBot.vue'
import { mascot } from '../controller/MascotController'
import { bodyTransform } from '../controller/PhysicsGesture'
import type { Window } from '@tauri-apps/api/window'

let desktopWindow: Window | null = null

const props = defineProps<{
  size: number
}>()

const bodyStyle = ref({ transform: 'none', transformOrigin: 'center center' })
const listenScale = ref(1.1)

let raf = 0

function frame() {
  bodyStyle.value = {
    transform: bodyTransform(mascot.physics.computeTransform(), mascot.audio.smoothedAmplitude),
    transformOrigin: 'center center'
  }
  listenScale.value = 1.1 + mascot.audio.smoothedAmplitude * 0.4
  raf = requestAnimationFrame(frame)
}

onMounted(() => {
  raf = requestAnimationFrame(frame)
  if (window.__TAURI_INTERNALS__) {
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      desktopWindow = getCurrentWindow()
    })
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
})

const CLICK = 6
let dragging = false
let startX = 0
let startY = 0
let originX = 0
let originY = 0
let grabX = 0
let grabY = 0
let scale = 1
let tracking = false
let latestX = 0
let latestY = 0
let queued: { x: number; y: number } | null = null
let moving = false

function placeAt(screenX: number, screenY: number) {
  return {
    x: originX + (screenX - grabX) * scale,
    y: originY + (screenY - grabY) * scale
  }
}

async function flushMove() {
  if (moving || !desktopWindow) return
  moving = true
  try {
    const { PhysicalPosition } = await import('@tauri-apps/api/dpi')
    while (queued && dragging) {
      const next = queued
      queued = null
      await desktopWindow.setPosition(new PhysicalPosition(Math.round(next.x), Math.round(next.y)))
    }
  } catch {
    queued = null
  } finally {
    moving = false
    if (queued && dragging) void flushMove()
  }
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0 || dragging) return
  dragging = true
  tracking = false
  startX = e.screenX
  startY = e.screenY
  latestX = e.screenX
  latestY = e.screenY
  grabX = e.screenX
  grabY = e.screenY
  scale = window.devicePixelRatio || 1
  mascot.dragStart(e.screenX, e.screenY)
  setDragEngaged(true)
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  } catch {
    // ignore
  }
  if (mascot.windowKnown.value) {
    originX = mascot.windowX.value
    originY = mascot.windowY.value
    tracking = true
    return
  }
  void lockOrigin()
}

async function lockOrigin() {
  if (!desktopWindow) return
  try {
    const pos = await desktopWindow.outerPosition()
    if (!dragging) return
    originX = pos.x
    originY = pos.y
    mascot.windowX.value = pos.x
    mascot.windowY.value = pos.y
    mascot.windowKnown.value = true
    tracking = true
    queued = placeAt(latestX, latestY)
    void flushMove()
  } catch {
    tracking = false
  }
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  latestX = e.screenX
  latestY = e.screenY
  mascot.physics.updateDrag(e.screenX, e.screenY)
  if (!desktopWindow || !tracking) return
  queued = placeAt(e.screenX, e.screenY)
  void flushMove()
}

function finishDrag(poke: boolean) {
  if (!dragging) return
  dragging = false
  tracking = false
  queued = null
  setDragEngaged(false)
  mascot.dragEnd()
  if (poke) mascot.poke()
}

function setDragEngaged(engaged: boolean) {
  if (!window.__TAURI_INTERNALS__) return
  void import('@tauri-apps/api/core').then(({ invoke }) => invoke('set_drag_engaged', { engaged }))
}

function onPointerUp(e: PointerEvent) {
  if (e.button !== 0) return
  const dist = Math.hypot(e.screenX - startX, e.screenY - startY)
  finishDrag(dist <= CLICK)
}

function onPointerCancel() {
  finishDrag(false)
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  mascot.toggleHub()
}
</script>

<template>
  <div
    class="relative inline-block cursor-grab active:cursor-grabbing select-none"
    :style="bodyStyle"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @contextmenu="onContextMenu"
  >
    <div
      v-if="mascot.isListening.value"
      class="absolute inset-0 rounded-full border-2 border-emerald-400/80 animate-ping pointer-events-none"
      :style="{ transform: `scale(${listenScale})` }"
    />

    <BloubBot
      class="pointer-events-none"
      :size="props.size"
      :shape="mascot.shape.value"
      :color="mascot.color.value"
      :expression="mascot.expression.value"
      :state="mascot.state.value"
      paper="transparent"
      :follow="false"
      :gaze="mascot.getGaze"
    />
  </div>
</template>
