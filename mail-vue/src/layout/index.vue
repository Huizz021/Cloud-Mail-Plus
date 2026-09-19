<template>
  <component
      :is="isIos ? IosLayout : ClassicLayout"
      :key="isIos ? 'ios' : 'classic'"
  />
</template>

<script setup>
import { computed } from 'vue'
import { useSettingStore } from '@/store/setting.js'
import ClassicLayout from '@/layout/classic/index.vue'
import IosLayout from '@/layout-ios/index.vue'

const settingStore = useSettingStore()

const isIos = computed(() => Number(settingStore.settings?.uiMotion) === 1)
</script>
