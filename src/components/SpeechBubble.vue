<script setup lang="ts">
import RichText from './RichText.vue'

const props = defineProps<{
  text: string
  visible: boolean
}>()
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 scale-90 translate-y-2"
    enter-to-class="opacity-100 scale-100 translate-y-0"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-90 translate-y-1"
  >
    <div
      v-if="props.visible && props.text"
      class="max-w-xs px-4 py-2.5 rounded-2xl bg-neutral-900/90 text-neutral-100 text-sm shadow-xl backdrop-blur-md border border-white/15 pointer-events-auto select-text leading-relaxed relative"
    >
      <RichText :text="props.text" />
      <div class="absolute -bottom-1.5 left-6 w-3 h-3 bg-neutral-900/90 rotate-45 border-r border-b border-white/15" />
    </div>
  </Transition>
</template>
