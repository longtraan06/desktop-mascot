<script setup lang="ts">
import { mascot } from '../controller/MascotController'
import { SHAPES, COLORS } from '@/bot/skins'
import { EXPRESSIONS } from '@/bot/expressions'

const emit = defineEmits<{
  (e: 'back'): void
}>()

function onSizeChange(e: Event) {
  mascot.setSize(Number((e.target as HTMLInputElement).value))
}

function selectShape(id: string) {
  mascot.setShape(id)
}

function selectColor(id: string) {
  mascot.setColor(id)
}

function selectExpression(id: typeof mascot.settings.restExpression) {
  mascot.settings.restExpression = id
  mascot.saveSettings()
}

function toggleStartWithWindows() {
  mascot.settings.startWithWindows = !mascot.settings.startWithWindows
  mascot.saveSettings()
  // Call Tauri autostart plugin if in desktop mode
  if (window.__TAURI_INTERNALS__) {
    import('@tauri-apps/plugin-autostart').then(({ enable, disable }) => {
      if (mascot.settings.startWithWindows) enable()
      else disable()
    }).catch(() => {})
  }
}

function toggleAutoHide() {
  mascot.settings.autoHideFullscreen = !mascot.settings.autoHideFullscreen
  mascot.saveSettings()
}

function onSleepChange(e: Event) {
  const minutes = Number((e.target as HTMLSelectElement).value)
  mascot.settings.autoSleepMinutes = minutes
  mascot.saveSettings()
  mascot.resetInactivityTimer()
}
</script>

<template>
  <div class="p-4 text-neutral-200 text-xs flex flex-col gap-4 max-h-[420px] overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-white/10 pb-2">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white transition cursor-pointer"
          @click="emit('back')"
          title="Quay lại Chat"
        >
          ← Chat
        </button>
        <span class="font-semibold text-sm text-white">Cài đặt Mascot</span>
      </div>
    </div>

    <!-- Kích thước -->
    <div class="flex flex-col gap-1.5">
      <div class="flex justify-between text-neutral-300">
        <span>Kích thước</span>
        <span class="font-mono text-emerald-400">{{ mascot.settings.size }}px</span>
      </div>
      <input
        type="range"
        min="80"
        max="220"
        step="5"
        :value="mascot.settings.size"
        class="w-full accent-emerald-500 cursor-pointer"
        @input="onSizeChange"
      />
    </div>

    <!-- Hình dáng thân (8 shapes) -->
    <div class="flex flex-col gap-1.5">
      <span class="text-neutral-300 font-medium">Hình dáng thân</span>
      <p class="text-neutral-500 leading-relaxed">
        Hình đã chọn chỉ giữ ở idle, wink, wide và notify. thinking, sleep và play dùng silhouette của trạng thái đó.
        Mắt là lỗ trong suốt, nên thấy nền phía sau.
      </p>
      <div class="grid grid-cols-4 gap-1.5">
        <button
          v-for="s in SHAPES"
          :key="s.id"
          type="button"
          class="px-2 py-1.5 rounded-lg border text-center truncate transition cursor-pointer"
          :class="mascot.settings.shape === s.id ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 font-medium' : 'border-white/10 hover:border-white/30 text-neutral-400'"
          @click="selectShape(s.id)"
        >
          {{ s.id }}
        </button>
      </div>
    </div>

    <!-- Bảng màu (12 colors) -->
    <div class="flex flex-col gap-1.5">
      <span class="text-neutral-300 font-medium">Màu sắc</span>
      <div class="grid grid-cols-6 gap-2">
        <button
          v-for="c in COLORS"
          :key="c.id"
          type="button"
          class="w-7 h-7 rounded-full border-2 transition relative flex items-center justify-center cursor-pointer"
          :style="{ backgroundColor: c.hex }"
          :class="mascot.settings.color === c.id ? 'border-white scale-110 shadow-lg' : 'border-white/20 hover:scale-105'"
          :title="c.id"
          @click="selectColor(c.id)"
        >
          <span v-if="mascot.settings.color === c.id" class="w-2 h-2 rounded-full" :style="{ backgroundColor: c.hex === '#0a0a0c' ? '#ffffff' : '#0a0a0c' }" />
        </button>
      </div>
    </div>

    <!-- Biểu cảm nghỉ mặc định (16 expressions) -->
    <div class="flex flex-col gap-1.5">
      <span class="text-neutral-300 font-medium">Biểu cảm khi nghỉ</span>
      <div class="grid grid-cols-4 gap-1.5 max-h-28 overflow-y-auto pr-1">
        <button
          v-for="expr in EXPRESSIONS"
          :key="expr.id"
          type="button"
          class="px-1.5 py-1 rounded border text-[11px] text-center truncate transition cursor-pointer"
          :class="mascot.settings.restExpression === expr.id ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 font-medium' : 'border-white/10 hover:border-white/20 text-neutral-400'"
          @click="selectExpression(expr.id)"
        >
          {{ expr.id }}
        </button>
      </div>
    </div>

    <!-- Hành vi & Hệ thống -->
    <div class="flex flex-col gap-2 pt-2 border-t border-white/10">
      <span class="text-neutral-300 font-medium">Hệ thống</span>

      <label class="flex items-center justify-between gap-3 py-1">
        <span>Tự động ngủ</span>
        <select
          class="bg-white/10 border border-white/10 rounded-lg px-2 py-1 text-neutral-100"
          :value="mascot.settings.autoSleepMinutes"
          @change="onSleepChange"
        >
          <option value="0">Tắt</option>
          <option value="5">5 phút</option>
          <option value="10">10 phút</option>
        </select>
      </label>
      
      <!-- Khởi động cùng Windows -->
      <label class="flex items-center justify-between cursor-pointer py-1">
        <span>Khởi động cùng Windows</span>
        <input
          type="checkbox"
          :checked="mascot.settings.startWithWindows"
          class="accent-emerald-500 w-4 h-4 cursor-pointer"
          @change="toggleStartWithWindows"
        />
      </label>

      <!-- Tự ẩn khi chơi game toàn màn hình -->
      <label class="flex items-center justify-between cursor-pointer py-1">
        <span>Tự ẩn khi bật Game toàn màn hình</span>
        <input
          type="checkbox"
          :checked="mascot.settings.autoHideFullscreen"
          class="accent-emerald-500 w-4 h-4 cursor-pointer"
          @change="toggleAutoHide"
        />
      </label>

      <!-- Phím tắt -->
      <div class="flex items-center justify-between py-1 text-neutral-400">
        <span>Phím tắt gọi nhanh</span>
        <kbd class="bg-white/10 px-1.5 py-0.5 rounded text-[11px] font-mono text-neutral-200">{{ mascot.settings.globalShortcut }}</kbd>
      </div>

      <div class="flex items-center justify-between py-1 text-neutral-400">
        <span>Ẩn tức thì (Boss Key)</span>
        <kbd class="bg-white/10 px-1.5 py-0.5 rounded text-[11px] font-mono text-neutral-200">{{ mascot.settings.bossKey }}</kbd>
      </div>
      <p v-if="mascot.shortcutError.value" class="text-red-400 leading-relaxed">{{ mascot.shortcutError.value }}</p>
    </div>
  </div>
</template>
