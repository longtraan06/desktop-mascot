<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { mascot } from '../controller/MascotController'
import RichText from './RichText.vue'
import SettingsPanel from './SettingsPanel.vue'
import type { ChatMessage } from '../types'

const messages = ref<ChatMessage[]>([
  {
    id: '1',
    role: 'assistant',
    content: 'Xin chào! Tôi là **Bloub Mascot**. Bạn có thể kéo thả tôi, click để chơi đùa, hoặc gõ tin nhắn bên dưới!',
    timestamp: Date.now()
  }
])

const inputPrompt = ref('')
const messageContainer = ref<HTMLDivElement | null>(null)
let streamTimer = 0
let hideTimer = 0

function scrollToBottom() {
  nextTick(() => {
    if (messageContainer.value) {
      messageContainer.value.scrollTop = messageContainer.value.scrollHeight
    }
  })
}

function handleSend() {
  const text = inputPrompt.value.trim()
  if (!text) return

  // Push user message
  messages.value.push({
    id: Date.now().toString(),
    role: 'user',
    content: text,
    timestamp: Date.now()
  })
  inputPrompt.value = ''
  scrollToBottom()

  // Kích hoạt bot suy nghĩ & phản hồi mẫu
  mascot.think('Đang xử lý')
  window.setTimeout(() => {
    mascot.stopThinking()
    void mascot.setState('play', 1.2)
    streamReply(`Tôi đã nhận được tin nhắn: "${text}". Cổng kết nối AI Chatbot đã sẵn sàng tiếp nhận!`)
  }, 1000)
}

function streamReply(reply: string) {
  if (streamTimer) window.clearInterval(streamTimer)
  if (hideTimer) window.clearTimeout(hideTimer)
  const id = (Date.now() + 1).toString()
  messages.value.push({
    id,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    isStreaming: true
  })
  mascot.showBubble('')
  let cursor = 0
  streamTimer = window.setInterval(() => {
    const token = reply.slice(cursor, cursor + 2)
    if (!token) {
      window.clearInterval(streamTimer)
      streamTimer = 0
      const done = messages.value.find((message) => message.id === id)
      if (done) done.isStreaming = false
      hideTimer = window.setTimeout(() => mascot.hideBubble(), 4000)
      return
    }
    cursor += token.length
    mascot.appendBubbleToken(token)
    const message = messages.value.find((item) => item.id === id)
    if (message) message.content += token
    scrollToBottom()
  }, 24)
}

function toggleMic() {
  if (mascot.isListening.value) {
    mascot.stopListening()
  } else {
    mascot.listen()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && mascot.isHubOpen.value) {
    mascot.closeHub()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (streamTimer) window.clearInterval(streamTimer)
  if (hideTimer) window.clearTimeout(hideTimer)
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 scale-95 translate-y-3"
    enter-to-class="opacity-100 scale-100 translate-y-0"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-95 translate-y-2"
  >
    <div
      v-if="mascot.isHubOpen.value"
      class="w-84 rounded-2xl bg-neutral-900/95 text-neutral-100 shadow-2xl backdrop-blur-xl border border-white/15 flex flex-col overflow-hidden pointer-events-auto select-none"
    >
      <!-- Header -->
      <div class="px-4 py-2.5 bg-white/5 border-b border-white/10 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span class="font-semibold text-xs tracking-wide">Bloub Companion</span>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition cursor-pointer"
            :class="{ 'bg-white/15 text-white': mascot.hubTab.value === 'settings' }"
            @click="mascot.hubTab.value = mascot.hubTab.value === 'settings' ? 'chat' : 'settings'"
            title="Cài đặt"
          >
            ⚙️
          </button>
          <button
            type="button"
            class="p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition cursor-pointer"
            @click="mascot.closeHub()"
            title="Đóng"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Tab Cài Đặt -->
      <div v-if="mascot.hubTab.value === 'settings'">
        <SettingsPanel @back="mascot.hubTab.value = 'chat'" />
      </div>

      <!-- Tab Chat Mặc định -->
      <div v-else class="flex flex-col h-80">
        <!-- Message list -->
        <div ref="messageContainer" class="flex-1 p-3 overflow-y-auto flex flex-col gap-2.5 text-xs select-text">
          <div
            v-for="m in messages"
            :key="m.id"
            class="flex flex-col"
            :class="m.role === 'user' ? 'items-end' : 'items-start'"
          >
            <div
              class="max-w-[85%] px-3 py-2 rounded-xl leading-relaxed"
              :class="m.role === 'user' ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-white/10 text-neutral-200 rounded-bl-none'"
            >
              <RichText :text="m.content" />
            </div>
          </div>
        </div>

        <!-- Input Bar -->
        <div class="p-2 border-t border-white/10 bg-white/5 flex items-center gap-1.5">
          <button
            type="button"
            class="w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer shrink-0"
            :class="mascot.isListening.value ? 'bg-red-500 text-white animate-pulse' : 'bg-white/10 hover:bg-white/20 text-neutral-300'"
            @click="toggleMic"
            title="Nói chuyện (Micro)"
          >
            🎙️
          </button>

          <input
            v-model="inputPrompt"
            type="text"
            placeholder="Nhắn tin với Mascot..."
            class="flex-1 bg-white/10 border border-white/10 focus:border-emerald-500 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-400 focus:outline-none"
            @keydown.enter="handleSend"
          />

          <button
            type="button"
            class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition cursor-pointer shrink-0"
            @click="handleSend"
          >
            Gửi
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
