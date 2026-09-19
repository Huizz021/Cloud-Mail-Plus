<template>
  <div :class="accountShow && hasPerm('account:query') ? 'main-box-show' : 'main-box-hide'">
    <div :class="accountShow && hasPerm('account:query') ? 'block-show' : 'block-hide'" @click="uiStore.accountShow = false"></div>
    <account  :class="accountShow && hasPerm('account:query') ? 'show' : 'hide'" />
    <router-view class="main-view" v-slot="{ Component,route }">
      <keep-alive :include="['email','all-email','send','star','user','role','analysis','reg-key','draft']">
        <component :is="Component" :key="route.name"/>
      </keep-alive>
    </router-view>
  </div>
</template>
<script setup>
import account from '@/layout/account/index.vue'
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {computed, onBeforeUnmount, onMounted, watch} from "vue";
import { useRoute } from 'vue-router'
import { hasPerm } from "@/perm/perm.js"
import { notifySwipe, NOTIFY_AUTO_DISMISS_MS } from "@/utils/notify-swipe.js";
import { maybePopupAnnounceFromSettings } from "@/utils/announce-popup.js";

const settingStore = useSettingStore()
const uiStore = useUiStore();
const route = useRoute()
let  innerWidth =  window.innerWidth

let elNotification = null

const accountShow = computed(() => {
  return uiStore.accountShow && settingStore.settings.manyEmail === 0
})

watch(() => uiStore.changeNotice, () => {

  const settings = settingStore.settings

  let data = {
    notice: settings.notice,
    noticeWidth: settings.noticeWidth,
    noticeTitle: settings.noticeTitle,
    noticeContent: settings.noticeContent,
    noticeType: settings.noticeType,
    noticeDuration: settings.noticeDuration,
    noticePosition: settings.noticePosition,
    noticeOffset: settings.noticeOffset
  }

  showNotice(data)
})

watch(() => uiStore.changePreview, () => {
  showNotice(uiStore.previewData)
})

function showNotice(data) {

  if (data.notice === 1) {
    return;
  }

  if (elNotification) {
    try { elNotification.close() } catch { /* noop */ }
    elNotification = null
  }

  const style = document.createElement('style');
  style.innerHTML = `
  .custom-notice.el-notification {
    --el-notification-width: min(${data.noticeWidth || 400}px,calc(100% - 30px)) !important;
  }
  `;
  document.head.appendChild(style);

  // 登录弹窗 / 公告：5 秒自动右滑；正文可能含 HTML，toast 内按 HTML 渲染
  elNotification = notifySwipe({
    title: data.noticeTitle,
    message: data.noticeContent,
    html: true,
    type: data.noticeType === 'none' ? '' : data.noticeType,
    position: data.noticePosition || 'top-right',
    offset: data.noticeOffset || 0,
    onClick: () => {}
  })
}

function maybeShowSiteAnnouncement() {
  const s = settingStore.settings || {}
  // 新全站公告：版本变化时弹窗（与登录弹窗分离）
  if (maybePopupAnnounceFromSettings(s)) {
    return
  }

  // 登录弹窗：独立文案，开启时每次进入展示
  if (s.notice === 0) {
    const loginBody = String(s.noticeContent || s.noticeTitle || '').trim()
    if (loginBody) {
      showNotice({
        notice: s.notice,
        noticeWidth: s.noticeWidth,
        noticeTitle: s.noticeTitle,
        noticeContent: s.noticeContent,
        noticeType: s.noticeType,
        noticeDuration: s.noticeDuration,
        noticePosition: s.noticePosition,
        noticeOffset: s.noticeOffset
      })
    }
  }
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  handleResize()
  maybeShowSiteAnnouncement()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})

const handleResize = () => {
  if (['content','email','send'].includes(route.meta.name)) {
    if (innerWidth !==  window.innerWidth) {
      innerWidth = window.innerWidth;
      uiStore.accountShow = window.innerWidth >= 767;
    }
  }
}

</script>
<style lang="scss" scoped>

.block-show {
  position: fixed;
  @media (max-width: 767px) {
    position: absolute;
    right: 0;
    border: 0;
    height: 100%;
    width: 100%;
    background: #000000;
    opacity: 0.6;
    z-index: 10;
    transition: all 300ms;
  }
}

.block-hide {
  position: fixed;
  pointer-events: none;
  transition: all 300ms;
}

.show {
  transition: all 100ms;
  @media (max-width: 767px) {
    position: fixed;
    z-index: 100;
    width: 260px;
  }
}

.hide {
  transition: all 100ms;
  position: fixed;
  transform: translateX(-100%);
  opacity: 0;
  @media (max-width: 1024px) {
    width: 260px;
    z-index: 100;
  }
}


.main-box-show {
  display: grid;
  grid-template-columns: 260px  1fr;
  height: calc(100% - 60px);
  min-height: 320px;
  pointer-events: auto;
  @media (max-width: 767px) {
    grid-template-columns: 1fr;
  }
}

.main-box-hide {
  display: grid;
  grid-template-columns: 1fr;
  height: calc(100% - 60px);
  min-height: 320px;
  pointer-events: auto;
}


.main-view {
  background: var(--el-bg-color);
  pointer-events: auto;
}


.navigation {
  height: 30px;
  border-bottom: solid 1px var(--el-menu-border-color);
  display: inline-flex;
  justify-items: center;
  align-items: center;
  width: 100%;
  .tag {
    background: var(--el-bg-color);
    margin-left: 5px;
  }
}
</style>
