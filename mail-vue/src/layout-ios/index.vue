<template>
  <div class="ios-shell">
    <aside class="ios-side">
      <div class="brand" @click="router.push({ name: 'email' })">
        ✉ {{ siteTitle }}
      </div>

      <div
          v-for="item in mainMenusVisible"
          :key="item.name"
          class="menu"
          :class="{ active: route.meta.name === item.name }"
          @click="go(item)"
      >
        <span class="ico">{{ item.icon }}</span>
        <span class="menu-name">{{ $t(item.title) }}</span>
        <span v-if="item.badge && badgeCount" class="pill on" :class="{ pop: badgePop }">{{ badgeCount }}</span>
      </div>

      <div v-if="manageVisible" class="menu-label">{{ $t('manage') }}</div>

      <div
          v-for="item in manageMenus"
          :key="item.name"
          class="menu"
          :class="{ active: route.meta.name === item.name }"
          @click="go(item)"
      >
        <span class="ico">{{ item.icon }}</span>
        <span class="menu-name">{{ $t(item.title) }}</span>
      </div>
    </aside>

    <div class="ios-main">
      <header class="ios-top">
        <div class="top-title">{{ pageTitle }}</div>
        <div class="top-actions">
          <el-dropdown
              trigger="hover"
              placement="bottom-end"
              :teleported="true"
              popper-class="ios-notice-dropdown"
              @visible-change="onNoticeVisible"
          >
            <div class="icon-btn" @click="onNoticeClick">
              🔔
              <span v-if="noticeCount" class="nbadge on">{{ noticeCount }}</span>
            </div>
            <template #dropdown>
              <div class="drop-panel">
                <div class="drop-head">
                  <span>{{ $t('messageCenter') }}</span>
                  <el-button link type="primary" size="small" @click="markSystemRead">{{ $t('messageMarkAllRead') }}</el-button>
                </div>
                <div v-if="canReviewForward && pendingCount > 0" class="drop-review">
                  <span>{{ $t('forwardPendingNotify', { count: pendingCount }) }}</span>
                  <el-button size="small" type="primary" @click="goReviewFromNotice">{{ $t('messageOpenReview') }}</el-button>
                </div>
                <div class="drop-list">
                  <div v-if="!systemMessages.length" class="drop-empty">{{ $t('messageEmpty') }}</div>
                  <div v-for="item in systemMessages" :key="item.messageId" class="drop-item">
                    <div class="drop-item-meta">
                      <span>{{ $t('messageSystem') }}</span>
                      <span>{{ item.createTime }}</span>
                    </div>
                    <div class="drop-item-content">{{ item.content }}</div>
                  </div>
                </div>
              </div>
            </template>
          </el-dropdown>

          <div class="icon-btn" @click="toggleDark">
            {{ uiStore.dark ? '☀️' : '🌙' }}
          </div>

          <el-dropdown
              trigger="hover"
              placement="bottom-end"
              :teleported="true"
              popper-class="ios-user-dropdown"
          >
            <div class="avatar-btn">
              <div class="avatar">{{ avatarText }}</div>
              <span class="avatar-name">{{ shortName }}</span>
            </div>
            <template #dropdown>
              <div class="drop-panel user-panel">
                <div class="user-av">{{ avatarText }}</div>
                <div class="user-name">{{ shortName }}</div>
                <div class="user-email" @click="copyEmail(userStore.user?.email)">
                  {{ userStore.user?.email }}
                </div>
                <div class="user-role">
                  <el-tag>{{ userStore.user?.role?.name || '-' }}</el-tag>
                </div>
                <div class="user-actions">
                  <el-button size="small" @click="router.push({ name: 'setting' })">{{ $t('settings') }}</el-button>
                  <el-button size="small" type="primary" :loading="logoutLoading" @click="clickLogout">
                    {{ $t('logOut') }}
                  </el-button>
                </div>
              </div>
            </template>
          </el-dropdown>
        </div>
      </header>

      <div class="ios-scroll">
        <div v-if="route.meta.name === 'email'" class="ios-hero">
          <div>
            <h1>{{ siteTitle }}</h1>
            <p>{{ homeHeroDesc }}</p>
          </div>
          <div class="kpis">
            <div class="kpi">
              <b>{{ inboxHint }}</b>
              <span>{{ $t('inbox') }}</span>
            </div>
            <!-- 管理员：待审批；普通用户：自己的转发状态，不显示审批 -->
            <div class="kpi" v-if="canReviewForward">
              <b>{{ pendingCount || 0 }}</b>
              <span>{{ $t('forwardApply') }}</span>
            </div>
            <div v-else class="kpi kpi-link" @click="router.push({ name: 'setting' })">
              <b class="kpi-text">{{ myForwardLabel }}</b>
              <span>{{ $t('otherEmail') }}</span>
            </div>
            <div class="kpi">
              <b>{{ chatUnread || 0 }}</b>
              <span>{{ $t('messageInbox') }}</span>
            </div>
          </div>
        </div>
        <Main />
      </div>
    </div>
  </div>

  <writer ref="writerRef" />
  <message-center />
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSettingStore } from '@/store/setting.js'
import { useUserStore } from '@/store/user.js'
import { useUiStore } from '@/store/ui.js'
import { hasPerm } from '@/perm/perm.js'
import { userForwardPendingCount } from '@/request/user.js'
import { myForwardQuery } from '@/request/my.js'
import { messageList, messageRead, messageUnreadCount } from '@/request/message.js'
import { logout } from '@/request/login.js'
import { notifySwipe, NOTIFY_AUTO_DISMISS_MS } from '@/utils/notify-swipe.js'
import { applyDarkMode } from '@/utils/ui-motion.js'
import { startRealtimePoll } from '@/utils/realtime-poll.js'
import { maybePopupAnnounce } from '@/utils/announce-popup.js'
import Main from '@/layout/main/index.vue'
import writer from '@/layout/write/index.vue'
import MessageCenter from '@/components/message-center/index.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const settingStore = useSettingStore()
const userStore = useUserStore()
const uiStore = useUiStore()

const writerRef = ref({})
const badgePop = ref(false)
const systemMessages = ref([])
const logoutLoading = ref(false)
let stopPoll = null

const siteTitle = computed(() => settingStore.settings?.title || 'Cloud Mail')
const homeHeroDesc = computed(() => {
  const custom = String(settingStore.settings?.homeHeroDesc || '').trim()
  if (custom) return custom
  return canReviewForward.value ? t('userPushSettingDesc') : t('heroUserDesc')
})
const shortName = computed(() => userStore.user?.name || userStore.user?.email || 'U')
const avatarText = computed(() => String(shortName.value)[0]?.toUpperCase() || 'U')
const pendingCount = computed(() => uiStore.forwardReviewPending || 0)
const chatUnread = computed(() => uiStore.messageChatUnread || 0)
// 普通用户顶栏红点不含「待审批」
const noticeCount = computed(() => {
  const sys = uiStore.messageSystemUnread || 0
  return canReviewForward.value ? sys + pendingCount.value : sys
})
const inboxHint = computed(() => '—')
const canReviewForward = computed(() => hasPerm('setting:query') || hasPerm('user:query'))

const myForwardState = ref({ apply: 0, active: false })
const myForwardLabel = computed(() => {
  if (!canReviewForward.value) {
    const apply = myForwardState.value.apply
    if (myForwardState.value.active) return t('forwardApplyActive')
    if (apply === 1) return t('forwardApplyPending')
    if (apply === 2) return t('forwardApplyApproved')
    if (apply === 3) return t('forwardApplyRejected')
    return t('forwardApplyNone')
  }
  return String(pendingCount.value || 0)
})

function loadMyForward() {
  if (canReviewForward.value) return
  myForwardQuery().then(data => {
    myForwardState.value = {
      apply: data?.forwardApply ?? 0,
      active: !!data?.forwardActive
    }
  }).catch(() => {})
}

const mainMenus = [
  { name: 'email', title: 'inbox', icon: '📥', path: { name: 'email' } },
  { name: 'send', title: 'sent', icon: '📤', path: { name: 'send' }, perm: 'email:send' },
  { name: 'draft', title: 'drafts', icon: '📝', path: { name: 'draft' }, perm: 'email:send' },
  { name: 'star', title: 'starred', icon: '⭐', path: { name: 'star' } },
  { name: 'setting', title: 'settings', icon: '⚙️', path: { name: 'setting' } }
]

const manageMenuSource = [
  { name: 'analysis', title: 'analytics', icon: '📊', path: { name: 'analysis' }, perm: 'analysis:query' },
  { name: 'user', title: 'allUsers', icon: '👥', path: { name: 'user' }, perm: 'user:query' },
  { name: 'all-email', title: 'allMail', icon: '📬', path: { name: 'all-email' }, perm: 'all-email:query' },
  { name: 'role', title: 'permissions', icon: '🔒', path: { name: 'role' }, perm: 'role:query' },
  { name: 'reg-key', title: 'inviteCode', icon: '🔑', path: { name: 'reg-key' }, perm: 'reg-key:query' },
  { name: 'sys-setting', title: 'SystemSettings', icon: '🖥', path: { name: 'sys-setting' }, perm: 'setting:query', badge: true }
]

const manageMenus = computed(() => manageMenuSource.filter(item => !item.perm || hasPerm(item.perm)))
const manageVisible = computed(() => manageMenus.value.length > 0)
const mainMenusVisible = computed(() => mainMenus.filter(item => !item.perm || hasPerm(item.perm)))

const pageTitle = computed(() => {
  const all = [...mainMenus, ...manageMenuSource]
  const hit = all.find(item => item.name === route.meta.name)
  return hit ? t(hit.title) : (route.meta.title ? t(route.meta.title) : siteTitle.value)
})

const badgeCount = computed(() => {
  if (!hasPerm('setting:query') && !hasPerm('user:query')) return 0
  return pendingCount.value
})

function go(item) {
  if (item.perm && !hasPerm(item.perm)) return
  router.push(item.path)
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

function onNoticeVisible(show) {
  if (show) loadSystemMessages()
}

function onNoticeClick() {
  // 点击也打开通知内容（悬停同样有效）
  loadSystemMessages()
}

function markSystemRead() {
  messageRead({ all: true }).then(() => {
    uiStore.messageSystemUnread = 0
    uiStore.messageChatUnread = 0
    uiStore.messageUnread = 0
    loadSystemMessages()
    refreshBadges()
  }).catch(() => {})
}

function goReviewFromNotice() {
  if (!hasPerm('setting:query')) {
    router.push({ name: 'user' })
    return
  }
  uiStore.openForwardReview()
  if (route.name !== 'sys-setting') {
    router.push({ name: 'sys-setting' })
  }
}

async function copyEmail(email) {
  try {
    await navigator.clipboard.writeText(email || '')
    ElMessage({ message: t('copySuccessMsg'), type: 'success', plain: true })
  } catch {
    ElMessage({ message: t('copyFailMsg'), type: 'error', plain: true })
  }
}

function clickLogout() {
  if (logoutLoading.value) return
  logoutLoading.value = true
  logout().then(() => {
    localStorage.removeItem('token')
    router.replace('/login')
  }).finally(() => {
    logoutLoading.value = false
  })
}

function toggleDark(e) {
  const nextIsDark = !uiStore.dark
  applyDarkMode(nextIsDark)
  uiStore.dark = nextIsDark
  if (e?.currentTarget) {
    const btn = e.currentTarget
    btn.style.transform = 'scale(.92)'
    setTimeout(() => { btn.style.transform = '' }, 160)
  }
}

async function refreshBadges() {
  try {
    const [pending, unread] = await Promise.all([
      canReviewForward.value ? userForwardPendingCount() : Promise.resolve({ pending: 0 }),
      messageUnreadCount()
    ])
    const prev = uiStore.forwardReviewPending || 0
    const nextPending = Number(pending?.pending) || 0
    uiStore.forwardReviewPending = canReviewForward.value ? nextPending : 0
    uiStore.messageUnread = Number(unread?.total) || 0
    uiStore.messageChatUnread = Number(unread?.chat) || 0
    uiStore.messageSystemUnread = Number(unread?.system) || 0
    loadMyForward()
    // 在线时新全站公告弹窗
    maybePopupAnnounce(unread)
    if (canReviewForward.value && nextPending > prev && nextPending > 0) {
      badgePop.value = true
      setTimeout(() => { badgePop.value = false }, 600)
      notifySwipe({
        title: t('forwardApply'),
        message: t('forwardPendingNotify', { count: nextPending }),
        type: 'warning'
      })
    }
  } catch { /* ignore */ }
}

watch(() => route.meta.name, () => refreshBadges())

onMounted(() => {
  uiStore.writerRef = writerRef
  const loading = document.getElementById('loading-first')
  if (loading) loading.remove()
  refreshBadges()
  // 站内信/公告近实时：约 2.5s，切回前台立即刷新
  stopPoll = startRealtimePoll(refreshBadges)
})

onBeforeUnmount(() => {
  if (stopPoll) stopPoll()
})
</script>

<style lang="scss" scoped>
.ios-shell {
  --spring: cubic-bezier(.32, .72, 0, 1);
  --spring-b: cubic-bezier(.34, 1.56, .64, 1);
  --ease: cubic-bezier(.25, .1, .25, 1);
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100vh;
  height: 100vh;
  width: 100%;
  position: relative;
  overflow: hidden;
  background: #f5f6f8;
  color: #1f2329;
  z-index: 1;
}

.ios-side {
  background: linear-gradient(180deg, #0b1220 0%, #0f172a 100%);
  color: #e2e8f0;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-right: 1px solid rgba(255, 255, 255, 0.04);
  overflow: auto;
}

.brand {
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #1890ff, #3a80dd);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 700;
  font-size: 15px;
  margin-bottom: 12px;
  box-shadow: 0 8px 20px rgba(24, 144, 255, 0.25);
  cursor: pointer;
  transition: transform 0.35s var(--spring-b);

  &:active { transform: scale(0.97); }
}

.menu-label {
  color: #94a3b8;
  font-size: 12px;
  padding: 10px 10px 6px;
  letter-spacing: 0.04em;
}

.menu {
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  color: #e2e8f0;
  cursor: pointer;
  font-size: 14px;
  transition: transform 0.28s var(--ease), background 0.22s ease, color 0.2s ease;

  .ico { width: 20px; text-align: center; }
  .menu-name { flex: 1; }

  &:hover { background: rgba(255, 255, 255, 0.06); }
  &:active { transform: scale(0.96); }

  &.active {
    background: linear-gradient(90deg, rgba(24, 144, 255, 0.28), rgba(24, 144, 255, 0.08));
    color: #fff;
    box-shadow: inset 0 0 0 1px rgba(24, 144, 255, 0.25);
  }
}

.pill {
  margin-left: auto;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  transform: scale(1);
  transition: transform 0.45s var(--spring-b);

  &.pop { animation: pill-pop 0.55s var(--spring-b); }
}

@keyframes pill-pop {
  0% { transform: scale(0); }
  40% { transform: scale(1.3); }
  70% { transform: scale(0.9); }
  100% { transform: scale(1); }
}

.ios-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #f5f6f8;
}

.ios-top {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: saturate(180%) blur(16px);
  -webkit-backdrop-filter: saturate(180%) blur(16px);
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  z-index: 20;
}

.top-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.2px;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drop-panel {
  width: 320px;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  padding: 10px 12px 12px;
  color: var(--el-text-color-primary);
  font-size: 13px;
}

.drop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-weight: 700;
}

.drop-review {
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

.drop-list {
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drop-empty {
  color: var(--regular-text-color);
  text-align: center;
  padding: 24px 0;
}

.drop-item {
  padding: 8px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
}

.drop-item-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--regular-text-color);
}

.drop-item-content {
  line-height: 1.5;
  word-break: break-word;
}

.user-panel {
  width: 250px;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding-bottom: 12px;
}

.user-av {
  width: 48px;
  height: 48px;
  margin-top: 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, #1890ff, #3a80dd);
  color: #fff;
  font-weight: 700;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-name {
  font-weight: 700;
  font-size: 14px;
}

.user-email {
  color: var(--regular-text-color);
  font-size: 12px;
  cursor: pointer;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  width: 100%;
  justify-content: center;
  flex-wrap: wrap;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: transform 0.3s var(--spring-b), box-shadow 0.25s ease, background 0.2s ease;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);

  &:hover { box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08); background: #fafbfc; }
  &:active { transform: scale(0.92); }
}

.nbadge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
}

.avatar-btn {
  height: 36px;
  padding: 0 10px 0 6px;
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.3s var(--spring-b), box-shadow 0.25s ease;

  &:active { transform: scale(0.96); }

  .avatar-name {
    font-size: 13px;
    font-weight: 600;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.avatar {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: linear-gradient(135deg, #1890ff, #3a80dd);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ios-scroll {
  flex: 1;
  overflow: auto;
  padding: 18px 22px 40px;
  position: relative;
  z-index: 1;
  pointer-events: auto;
}

.ios-side,
.ios-top {
  pointer-events: auto;
  z-index: 2;
}

.ios-hero {
  border-radius: 16px;
  padding: 20px 22px;
  color: #fff;
  margin-bottom: 16px;
  background: linear-gradient(120deg, #0ea5e9 0%, #2563eb 55%, #7c3aed 100%);
  box-shadow: 0 16px 40px rgba(37, 99, 235, 0.22);
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 16px;
  align-items: center;

  h1 {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.4px;
  }

  p {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.55;
    opacity: 0.92;
    max-width: 460px;
  }
}

.kpis {
  display: flex;
  gap: 10px;
}

.kpi {
  flex: 1;
  background: rgba(255, 255, 255, 0.16);
  border-radius: 12px;
  padding: 12px;
  backdrop-filter: blur(8px);
  text-align: center;

  b {
    display: block;
    font-size: 22px;
    font-weight: 800;
  }

  .kpi-text {
    font-size: 16px;
    line-height: 1.3;
  }

  span {
    font-size: 12px;
    opacity: 0.9;
  }
}

.kpi-link {
  cursor: pointer;
  transition: transform 0.25s cubic-bezier(.32,.72,0,1), background 0.2s ease;

  &:active {
    transform: scale(0.96);
  }

  &:hover {
    background: rgba(255, 255, 255, 0.22);
  }
}

:deep(.el-header) {
  display: none;
}

@media (max-width: 1025px) {
  .ios-shell {
    grid-template-columns: 72px 1fr;
  }

  .menu-name,
  .menu-label,
  .avatar-name,
  .pill {
    display: none;
  }

  .brand {
    font-size: 0;
    padding: 0;

    &::after {
      content: '✉';
      font-size: 18px;
    }
  }

  .menu {
    justify-content: center;
    padding: 0;
  }

  .ios-hero {
    grid-template-columns: 1fr;
  }
}

/* —— 暗色模式：新布局整体适配 —— */
:global(html.dark) .ios-shell {
  background: #0c0f14;
  color: #e5e7eb;
}

:global(html.dark) .ios-main {
  background: #0c0f14;
}

:global(html.dark) .ios-top {
  background: rgba(18, 22, 28, 0.82);
  border-bottom-color: rgba(255, 255, 255, 0.06);
}

:global(html.dark) .top-title {
  color: #f3f4f6;
}

:global(html.dark) .icon-btn,
:global(html.dark) .avatar-btn {
  background: #1c2128;
  border-color: rgba(255, 255, 255, 0.08);
  color: #e5e7eb;
  box-shadow: none;
}

:global(html.dark) .icon-btn:hover,
:global(html.dark) .avatar-btn:hover {
  background: #252b33;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}

:global(html.dark) .ios-hero {
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
}

:global(html.dark) .ios-side {
  background: linear-gradient(180deg, #080b12 0%, #0d121a 100%);
  border-right-color: rgba(255, 255, 255, 0.04);
}

:global(html.dark) .drop-panel {
  background: #1c2128;
  color: #e5e7eb;
}

:global(html.dark) .drop-item {
  background: rgba(255, 255, 255, 0.06);
}

:global(html.dark) .drop-empty,
:global(html.dark) .drop-item-meta,
:global(html.dark) .user-email {
  color: #9ca3af;
}

:global(html.dark) .drop-review {
  background: rgba(245, 158, 11, 0.16);
}

/* 经典/页面卡片在暗色下不要继续死白 */
:global(html.dark.ui-motion-ios) .settings-card,
:global(html.dark.ui-motion-ios) .el-card {
  background: #1c2128 !important;
  border-color: rgba(255, 255, 255, 0.06) !important;
}

:global(html.dark.ui-motion-ios) .push-setting .push-item,
:global(html.dark.ui-motion-ios) .language,
:global(html.dark.ui-motion-ios) .del-email {
  background: #1c2128;
  border-color: rgba(255, 255, 255, 0.06);
}

:global(html.dark.ui-motion-ios) .el-header {
  background: rgba(18, 22, 28, 0.72) !important;
}
</style>

<style>
/* 暗色：新布局顶栏/侧栏/按钮强制深色，避免 scoped 样式盖住 */
html.dark .ios-top,
html.dark.ui-motion-ios .ios-top {
  background: #12171f !important;
  color: #f2f4f8 !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
}

html.dark .ios-top .top-title,
html.dark .ios-top .top-actions,
html.dark .ios-top .icon-btn,
html.dark .ios-top .avatar-btn,
html.dark .ios-top .avatar-name {
  color: #f2f4f8 !important;
}

html.dark .ios-top .icon-btn,
html.dark .ios-top .avatar-btn {
  background: #1a1f27 !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

html.dark .ios-shell,
html.dark .ios-main,
html.dark .ios-scroll {
  background: #0c0f14 !important;
  color: #f2f4f8 !important;
}

html.dark .ios-side {
  background: linear-gradient(180deg, #080b12 0%, #0c121a 100%) !important;
}

html.dark .ios-side .menu {
  color: #e6eaf0 !important;
}

html.dark .ios-side .menu.active {
  background: linear-gradient(90deg, rgba(56, 132, 255, 0.22), rgba(56, 132, 255, 0.06)) !important;
  color: #fff !important;
}
</style>
