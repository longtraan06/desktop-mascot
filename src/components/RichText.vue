<script setup lang="ts">
import { computed } from 'vue'
import { parseRichText } from '../controller/richText'

const props = defineProps<{
  text: string
}>()

const parts = computed(() => parseRichText(props.text))
</script>

<template>
  <span>
    <template v-for="(part, i) in parts" :key="i">
      <br v-if="part.kind === 'break'" />
      <strong v-else-if="part.kind === 'strong'">{{ part.text }}</strong>
      <code v-else-if="part.kind === 'code'" class="bg-white/10 px-1 rounded text-emerald-300 font-mono text-xs">{{ part.text }}</code>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>
