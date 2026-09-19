<template>
  <div class="header" :class="!hasPerm('email:send') ? 'not-send' : ''">
    <div class="header-btn">
      <hanburger @click="changeAside"></hanburger>
      <span class="breadcrumb-item">{{ $t(route.meta.title) }}</span>
    </div>
    <div v-perm="'email:send'" class="writer-box" @click="openSend">
      <div class="writer">
        <Icon icon="material-symbols:edit-outline-sharp" width="22" height="22"/>
      </div>
    </div>
    <div class="toolbar">
      <el-dropdown
          ref="noticeDropdownRef"
          trigger="hover"
          placement="bottom-end"
          :teleported="true"
          popper-class="notice-dropdown"
          @visible-change="onNoticeVisible"
      >
        <div class="icon-item message-center-icon">
          <el-badge :hidden="!systemNoticeCount" :value="systemNoticeCount" :max="99">
            <Icon icon="streamline-plump:announcement-megaphone" width="20" height="20"/>
          </el-badge>
        </div>
        <template #dropdown>
          <div class="notice-panel">
            <div class="notice-panel-head">
              <span>{{ $t('messageCenter') }}</span>
              <el-button link type="primary" size="small" @click="markSystemRead">{{ $t('messageMarkAllRead') }}</el-button>
            </div>
            <div v-if="canReviewForward && (uiStore.forwardReviewPending || 0) > 0" class="notice-review-bar">
              <span>{{ $t('forwardPendingNotify', { count: uiStore.forwardReviewPending }) }}</span>
              <el-button size="small" type="primary" @click="goReviewFromNotice">{{ $t('messageOpenReview') }}</el-button>
            </div>
            <div class="notice-list">
              <div v-if="!systemMessages.length" class="notice-empty">{{ $t('messageEmpty') }}</div>
              <div v-for="item in systemMessages" :key="item.messageId" class="notice-item">
                <div class="notice-item-meta">
                  <span>{{ $t('messageSystem') }}</span>
                  <span>{{ item.createTime }}</span>
                </div>
                <div class="notice-item-content">{{ item.content }}</div>
              </div>
            </div>
          </div>
        </template>
      </el-dropdown>
      <div v-if="uiStore.dark" class="sun-icon icon-item" @click="openDark($event)">
        <Icon icon="mingcute:sun-fill"/>
      </div>
      <div v-else class="dark-icon icon-item" @click="openDark($event)">
        <Icon icon="solar:moon-linear"/>
      </div>
      <el-dropdown ref="userinfoRef" @visible-change="e => userInfoShow = e" :teleported="false" popper-class="detail-dropdown">
        <div class="avatar" @click="userInfoHide" >
          <div class="avatar-text">
            <div>{{ formatName(userStore.user.email) }}</div>
          </div>
          <Icon class="setting-icon" icon="mingcute:down-small-fill" width="24" height="24"/>
        </div>
        <template #dropdown>
          <div class="user-details">
            <div class="details-avatar">
              {{ formatName(userStore.user.email) }}
            </div>
            <div class="user-name">
              {{ userStore.user.name }}
            </div>
            <div class="detail-email" @click="copyEmail(userStore.user.email)">
              {{ userStore.user.email }}
            </div>
            <div class="detail-user-type">
              <el-tag>{{ userStore.user.role.name }}</el-tag>
            </div>
            <div class="action-info">
              <div>
                <span style="margin-right: 10px">{{ $t('sendCount') }}</span>
                <span style="margin-right: 10px">{{ $t('accountCount') }}</span>
              </div>
              <div>
                <div>
                  <span v-if="sendCount" style="margin-right: 5px">{{ sendCount }}</span>
                  <el-tag v-if="!hasPerm('email:send')">{{ sendType }}</el-tag>
                  <el-tag v-else>{{ sendType }}</el-tag>
                </div>
                <div>
                  <el-tag v-if="settingStore.settings.manyEmail || settingStore.settings.addEmail">
                    {{ $t('disabled') }}
                  </el-tag>
                  <span v-else-if="accountCount && hasPerm('account:add')"
                        style="margin-right: 5px">{{ $t('totalUserAccount', {msg: accountCount}) }}</span>
                  <el-tag v-else-if="!accountCount && hasPerm('account:add')">{{ $t('unlimited') }}</el-tag>
                  <el-tag v-else-if="!hasPerm('account:add')">{{ $t('unauthorized') }}</el-tag>
                </div>
              </div>
            </div>
            <div class="logout">
              <el-button type="primary" :loading="logoutLoading" @click="clickLogout">{{ $t('logOut') }}</el-button>
            </div>
          </div>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
import router from "@/router";
import hanburger from '@/components/hamburger/index.vue'
import {logout} from "@/request/login.js";
import {userForwardPendingCount} from "@/request/user.js";
import {messageList, messageRead, messageUnreadCount} from "@/request/message.js";
import {Icon} from "@iconify/vue";
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import {useRoute} from "vue-router";
import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import {useSettingStore} from "@/store/setting.js";
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import {setExtend} from "@/utils/day.js"
import {notifySwipe, NOTIFY_AUTO_DISMISS_MS} from "@/utils/notify-swipe.js";
import {applyDarkMode} from "@/utils/ui-motion.js";
import {startRealtimePoll} from "@/utils/realtime-poll.js";
import {maybePopupAnnounce} from "@/utils/announce-popup.js";

const {t} = useI18n();
const route = useRoute();
const settingStore = useSettingStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const logoutLoading = ref(false)
const userInfoShow = ref(false)
const userinfoRef = ref({})
let stopPoll = null

const canReviewForward = computed(() => {
  return hasPerm('setting:query') || hasPerm('user:query')
})

const systemMessages = ref([])

const systemNoticeCount = computed(() => {
  const sys = uiStore.messageSystemUnread || 0
  const pending = canReviewForward.value ? (uiStore.forwardReviewPending || 0) : 0
  return sys + pending
})

function onNoticeVisible(show) {
  if (!show) return
  loadSystemMessages()
}

async function loadSystemMessages() {
  try {
    const list = await messageList()
    systemMessages.value = (Array.isArray(list) ? list : [])
        .filter(item => item.msgType === 1 || item.fromUserId === 0)
        .slice(0, 20)
  } catch {
    systemMessages.value = []
  }
}

function markSystemRead() {
  messageRead({ all: true }).then(() => {
    uiStore.messageSystemUnread = 0
    uiStore.messageChatUnread = 0
    uiStore.messageUnread = 0
    loadSystemMessages()
    refreshForwardPending(true)
  }).catch(() => {})
}

function goReviewFromNotice() {
  uiStore.openForwardReview()
  if (route.name !== 'sys-setting') {
    router.push({ name: 'sys-setting' })
  }
}

function refreshForwardPending(silent = true) {
  if (!canReviewForward.value) return
  userForwardPendingCount().then(data => {
    const next = Number(data?.pending) || 0
    const prev = uiStore.forwardReviewPending || 0
    uiStore.forwardReviewPending = next
    const increased = next > prev
    if (next > 0 && increased) {
      notifySwipe({
        title: t('forwardApply'),
        message: t('forwardPendingNotify', { count: next }),
        type: 'warning',
        duration: NOTIFY_AUTO_DISMISS_MS,
      })
    }
  }).catch(() => {})
}

function refreshMessageUnread() {
  messageUnreadCount().then(data => {
    const chat = Number(data?.chat) || 0
    const system = Number(data?.system) || 0
    const total = Number(data?.total) || (chat + system)
    const prevSystem = uiStore.messageSystemUnread || 0
    uiStore.messageUnread = total
    uiStore.messageChatUnread = chat
    uiStore.messageSystemUnread = system
    // 在线时发现新全站公告 → 弹窗
    maybePopupAnnounce(data)
    if (system > prevSystem && system > 0) {
      notifySwipe({
        title: t('messageCenter'),
        message: t('messageUnread', { count: system }),
        type: 'info',
      })
    }
  }).catch(() => {})
}

function refreshNotify() {
  refreshForwardPending(true)
  refreshMessageUnread()
}

watch(() => route.name, () => {
  refreshNotify()
})

function onWindowFocus() {
  refreshNotify()
}

onMounted(() => {
  refreshNotify()
  // 通知/待审批近实时：约 2.5 秒
  stopPoll = startRealtimePoll(refreshNotify)
})

onBeforeUnmount(() => {
  if (typeof stopPoll === 'function') stopPoll()
  stopPoll = null
  window.removeEventListener('focus', onWindowFocus)
  document.removeEventListener('visibilitychange', onWindowFocus)
})

const accountCount = computed(() => {
  return userStore.user.role.accountCount
})

const sendType = computed(() => {

  if (settingStore.settings.send === 1) {
    return t('disabled')
  }

  if (!hasPerm('email:send')) {
    return t('unauthorized')
  }

  if (userStore.user.role.sendType === 'ban') {
    return t('sendBanned')
  }

  if (userStore.user.role.sendType === 'internal') {
    return t('sendInternal')
  }

  if (!userStore.user.role.sendCount) {
    return t('unlimited')
  }

  if (userStore.user.role.sendType === 'day') {
    return t('daily')
  }

  if (userStore.user.role.sendType === 'count') {
    return t('total')
  }
})

const sendCount = computed(() => {


  if (!hasPerm('email:send')) {
    return null
  }

  if (userStore.user.role.sendType === 'ban') {
    return null
  }

  if (userStore.user.role.sendType === 'internal') {
    return null
  }

  if (!userStore.user.role.sendCount) {
    return null
  }

  if (settingStore.settings.send === 1) {
    return null
  }

  return userStore.user.sendCount + '/' + userStore.user.role.sendCount
})

function userInfoHide(e) {
    if (userInfoShow.value) {
        userinfoRef.value.handleClose()
    } else {
        userinfoRef.value.handleOpen()
    }
}

async function copyEmail(email) {
  try {
    await navigator.clipboard.writeText(email);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true,
    })
  }
}

function changeLang(lang) {
  setExtend(lang === 'en' ? 'en' : 'zh-cn')
  settingStore.lang = lang
}

function openNotice() {
  uiStore.showNotice()
}

function openDark(e) {

  const nextIsDark = !uiStore.dark
  const root = document.documentElement

  if (!document.startViewTransition) {
    switchDark(nextIsDark, root);
    return
  }

  const x = e.clientX
  const y = e.clientY

  const maxX = Math.max(x, window.innerWidth - x)
  const maxY = Math.max(y, window.innerHeight - y)
  const endRadius = Math.hypot(maxX, maxY)

  // 标记切换目标，供 CSS 选择器使用
  root.setAttribute('data-theme-to', nextIsDark ? 'dark' : 'light')
  root.style.setProperty('--vt-x', `${x}px`)
  root.style.setProperty('--vt-y', `${y}px`)
  root.style.setProperty('--vt-end-radius', `${endRadius + 10}px`)

  const transition = document.startViewTransition(() => {
    switchDark(nextIsDark, root);
  })

  transition.finished.finally(() => {
    // 清理标记
    root.removeAttribute('data-theme-to')
  })
}

function switchDark(nextIsDark, root) {
  applyDarkMode(nextIsDark)
  uiStore.dark = nextIsDark
}

function openSend() {
  uiStore.writerRef.open()
}

function changeAside() {
  uiStore.asideShow = !uiStore.asideShow
}

function clickLogout() {
  logoutLoading.value = true
  logout().then(() => {
    localStorage.removeItem("token")
    router.replace('/login')
  }).finally(() => {
    logoutLoading.value = false
  })
}

function formatName(email) {
  return email[0]?.toUpperCase() || ''
}

</script>
<style>
.detail-dropdown {
  color: var(--el-text-color-primary) !important;
}
</style>
<style lang="scss" scoped>

:deep(.el-popper.is-pure) {
  border-radius: 6px;
}

.user-details {
  width: 250px;
  font-size: 14px;
  display: grid;
  grid-template-columns: 1fr;
  justify-items: center;

  .user-name {
    font-weight: bold;
    margin-top: 10px;
    padding-left: 20px;
    padding-right: 20px;
    width: 250px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
  }

  .detail-user-type {
    margin-top: 10px;
  }

  .action-info {
    width: 100%;
    display: grid;
    grid-template-columns: auto auto;
    margin-top: 10px;

    > div:first-child {
      display: grid;
      align-items: center;
      gap: 10px;
    }

    > div:last-child {
      display: grid;
      gap: 10px;
      text-align: center;

      > div {
        display: flex;
        align-items: center;
      }
    }
  }

  .detail-email {
    padding-left: 20px;
    padding-right: 20px;
    width: 250px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: center;
    color: var(--regular-text-color);
    cursor: pointer;
  }

  .logout {
    margin-top: 20px;
    width: 100%;
    padding-left: 10px;
    padding-right: 10px;
    padding-bottom: 10px;

    .el-button {
      border-radius: 6px;
      height: 28px;
      width: 100%;
    }
  }

  .details-avatar {
    margin-top: 20px;
    height: 40px;
    width: 40px;
    background: var(--el-bg-color);
    color: var(--el-text-color-primary);
    border: 1px solid var(--dark-border);
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
  }
}


.header {
  text-align: right;
  font-size: 12px;
  display: grid;
  height: 100%;
  gap: 10px;
  grid-template-columns: auto auto 1fr;
}

.header.not-send {
  grid-template-columns: auto 1fr;
}

.writer-box {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 5px;

  .writer {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    color: #ffffff;
    background: linear-gradient(135deg, #1890ff, #3a80dd);
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;

    .writer-text {
      margin-left: 15px;
      font-size: 14px;
      font-weight: bold;;
    }
  }
}

.header-btn {
  display: inline-flex;
  align-items: center;
  height: 100%;
  min-width: 0;
}

.breadcrumb-item {
  font-weight: bold;
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.toolbar {
  display: flex;
  justify-content: end;
  gap: 15px;
  @media (max-width: 767px) {
    gap: 10px;
  }

  .icon-item {
    align-self: center;
    width: 30px;
    height: 30px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .icon-item:hover {
    background: var(--base-fill);
  }

  .notice {
    font-size: 22px;
    margin-right: 4px;
  }

  .message-center-icon {
    :deep(.el-badge__content) {
      transform: translateY(-2px) translateX(100%);
    }
  }

  .dark-icon {
    font-size: 20px;
  }

  .sun-icon {
    font-size: 24px;
  }

  .avatar {
    display: flex;
    align-items: center;
    cursor: pointer;

    .avatar-text {
      background: var(--el-bg-color);
      color: var(--el-text-color-primary);
      height: 30px;
      width: 30px;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 8px;
      border: 1px solid var(--dark-border);
    }

    .setting-icon {
      position: relative;
      top: 0;
      margin-right: 10px;
      bottom: 10px;
    }
  }

}

.notice-panel {
  width: 320px;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  padding: 10px 12px 12px;
  color: var(--el-text-color-primary);
  font-size: 13px;
}

.notice-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-weight: 700;
}

.notice-review-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  margin-bottom: 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--el-color-warning) 14%, transparent);
  font-size: 12px;
}

.notice-list {
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notice-empty {
  color: var(--regular-text-color);
  text-align: center;
  padding: 24px 0;
}

.notice-item {
  padding: 8px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}

.notice-item-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--regular-text-color);
}

.notice-item-content {
  line-height: 1.5;
  word-break: break-word;
}

.el-tooltip__trigger:first-child:focus-visible {
  outline: unset;
}
</style>
