<template>
  <div
      class="msg-float-root"
      @mouseenter="onRootEnter"
      @mouseleave="onRootLeave"
  >
    <transition name="msg-pop">
      <div v-show="panelVisible" class="msg-float-panel" :class="{ 'is-admin-chat': isAdmin }">
        <!-- 管理员：好友列表 + 独立会话 -->
        <template v-if="isAdmin">
          <aside class="msg-friends">
            <div class="msg-friends-head">{{ $t('messageFriends') }}</div>
            <div class="msg-friends-search">
              <el-input v-model="keyword" size="small" clearable :placeholder="$t('messageSearch')" @input="onKeywordInput"/>
            </div>
            <div class="msg-friends-list" v-loading="loading">
              <div v-if="!conversations.length" class="message-empty">{{ $t('messageEmpty') }}</div>
              <div
                  v-for="item in conversations"
                  :key="item.userId"
                  class="msg-friend-item"
                  :class="{ active: activeUserId === item.userId }"
                  @click="selectUser(item.userId)"
              >
                <div class="friend-avatar">{{ formatName(item.email) }}</div>
                <div class="friend-main">
                  <div class="friend-name">
                    <span class="friend-email">{{ item.email }}</span>
                    <el-badge v-if="item.unread" :value="item.unread" :max="99"/>
                  </div>
                  <div class="friend-preview">{{ item.lastContent || '-' }}</div>
                </div>
              </div>
            </div>
          </aside>

          <section class="msg-chat">
            <div class="msg-float-header">
              <div class="msg-float-title">
                <span v-if="activeUser">{{ activeUser.email }}</span>
                <span v-else>{{ $t('messageInbox') }}</span>
              </div>
              <div class="msg-float-actions">
                <el-button v-if="activeUserId" link type="danger" size="small" @click="deleteConv">{{ $t('messageDeleteConv') }}</el-button>
                <el-button link type="primary" size="small" @click="markThreadRead">{{ $t('messageMarkAllRead') }}</el-button>
                <el-button link size="small" @click="panelVisible = false">×</el-button>
              </div>
            </div>

            <div v-if="!activeUserId" class="message-empty chat-empty">{{ $t('messageNoChat') }}</div>
            <template v-else>
              <div class="message-tip">{{ $t('messageAdminOnly') }}</div>
              <div ref="listRef" class="message-list" v-loading="threadLoading">
                <div v-if="!threadMessages.length" class="message-empty">{{ $t('messageEmpty') }}</div>
                <div
                    v-for="item in threadMessages"
                    :key="item.messageId"
                    class="message-item"
                    :class="messageClass(item)"
                >
                  <div class="message-meta">
                    <span class="message-from">{{ fromLabel(item) }}</span>
                    <span class="message-time">{{ item.createTime }}</span>
                  </div>
                  <div class="message-content">{{ item.content }}</div>
                </div>
              </div>
              <div class="message-compose">
                <div class="compose-row">
                  <el-input
                      v-model="draft"
                      type="textarea"
                      :rows="2"
                      size="small"
                      :placeholder="$t('messageInputHint')"
                      maxlength="2000"
                      @keydown.enter.exact.prevent="send"
                  />
                  <el-button type="primary" size="small" :loading="sending" @click="send">{{ $t('send') }}</el-button>
                </div>
              </div>
            </template>
          </section>
        </template>

        <!-- 普通用户：直接与管理员聊天 -->
        <template v-else>
          <div class="msg-float-header">
            <div class="msg-float-title">{{ $t('messageInbox') }}</div>
            <div class="msg-float-actions">
              <el-input v-model="keyword" size="small" clearable class="user-search" :placeholder="$t('messageSearch')" @input="onKeywordInput"/>
              <el-button link type="danger" size="small" @click="deleteConv">{{ $t('messageDeleteConv') }}</el-button>
              <el-button link type="primary" size="small" @click="markThreadRead">{{ $t('messageMarkAllRead') }}</el-button>
              <el-button link size="small" @click="panelVisible = false">×</el-button>
            </div>
          </div>
          <div class="message-tip">{{ $t('messageAdminOnly') }}</div>
          <div ref="listRef" class="message-list" v-loading="threadLoading">
            <div v-if="!threadMessages.length" class="message-empty">{{ $t('messageEmpty') }}</div>
            <div
                v-for="item in threadMessages"
                :key="item.messageId"
                class="message-item"
                :class="messageClass(item)"
            >
              <div class="message-meta">
                <span class="message-from">{{ fromLabel(item) }}</span>
                <span class="message-time">{{ item.createTime }}</span>
              </div>
              <div class="message-content">{{ item.content }}</div>
            </div>
          </div>
          <div class="message-compose">
            <div class="compose-row">
              <el-input
                  v-model="draft"
                  type="textarea"
                  :rows="2"
                  size="small"
                  :placeholder="$t('messageInputHint')"
                  maxlength="2000"
                  @keydown.enter.exact.prevent="send"
              />
              <el-button type="primary" size="small" :loading="sending" @click="send">{{ $t('send') }}</el-button>
            </div>
          </div>
        </template>
      </div>
    </transition>

    <div
        class="msg-float-btn"
        :class="{ 'is-open': panelVisible }"
        :title="$t('messageInbox')"
        @click="toggle"
    >
      <el-badge :hidden="!chatUnread" :value="chatUnread" :max="99">
        <Icon icon="mingcute:message-3-fill" width="22" height="22"/>
      </el-badge>
      <span class="msg-float-btn-text">{{ $t('messageInbox') }}</span>
    </div>
  </div>
</template>

<script setup>
import {computed, defineOptions, nextTick, onBeforeUnmount, ref, watch} from 'vue'
import {Icon} from '@iconify/vue'
import {messageConversations, messageDeleteConversation, messageList, messageRead, messageSend, messageUnreadCount} from '@/request/message.js'
import {useUiStore} from '@/store/ui.js'
import {useUserStore} from '@/store/user.js'
import {useI18n} from 'vue-i18n'
import {startRealtimePoll} from '@/utils/realtime-poll.js'
import {maybePopupAnnounce} from '@/utils/announce-popup.js'

defineOptions({ name: 'MessageCenter' })

const { t } = useI18n()
const uiStore = useUiStore()
const userStore = useUserStore()

const panelVisible = ref(false)
const loading = ref(false)
const threadLoading = ref(false)
const sending = ref(false)
const conversations = ref([])
const threadMessages = ref([])
const draft = ref('')
const activeUserId = ref(null)
const keyword = ref('')
const listRef = ref(null)
let liveTimer = null
let leaveTimer = null
let keywordTimer = null
let stopLivePollFn = null

const isAdmin = computed(() => {
  const keys = userStore.user?.permKeys
  return Array.isArray(keys) && (keys.includes('*') || keys.includes('setting:query'))
})

const chatUnread = computed(() => uiStore.messageChatUnread || 0)

const activeUser = computed(() => {
  return conversations.value.find(item => item.userId === activeUserId.value) || null
})

watch(panelVisible, (val) => {
  if (val) startLivePoll()
  else stopLivePoll()
})

function onRootEnter() {
  if (leaveTimer) {
    clearTimeout(leaveTimer)
    leaveTimer = null
  }
  openPanel()
}

function onRootLeave() {
  if (leaveTimer) clearTimeout(leaveTimer)
  leaveTimer = setTimeout(() => {
    panelVisible.value = false
  }, 220)
}

function toggle() {
  panelVisible.value = !panelVisible.value
  if (panelVisible.value) openPanel()
}

function formatName(email) {
  return String(email || '?')[0]?.toUpperCase() || '?'
}

async function openPanel() {
  panelVisible.value = true
  // 点开即清空聊天未读：用户端 / 管理员端红点一起消失
  await markAllChatRead()
  await loadConversations()
  if (!isAdmin.value) {
    activeUserId.value = conversations.value[0]?.userId || null
    if (activeUserId.value) await loadThread()
  } else if (activeUserId.value) {
    await loadThread()
  } else if (conversations.value.length) {
    const unreadItem = conversations.value.find(item => item.unread > 0)
    activeUserId.value = (unreadItem || conversations.value[0]).userId
    await loadThread()
  }
  await refreshUnread()
  await loadConversations()
}

async function markAllChatRead() {
  try {
    await messageRead({ allChat: true })
  } catch { /* ignore */ }
  // 乐观更新，立刻熄灭站内信红点
  uiStore.messageChatUnread = 0
  uiStore.messageUnread = uiStore.messageSystemUnread || 0
  conversations.value = conversations.value.map(item => ({ ...item, unread: 0 }))
}

async function selectUser(userId) {
  if (activeUserId.value === userId) {
    await loadThread()
  } else {
    activeUserId.value = userId
    draft.value = ''
    await loadThread()
  }
  // 切换/查看某个会话时清掉该侧未读
  await markThreadRead()
}

async function loadConversations() {
  loading.value = true
  try {
    const list = await messageConversations()
    conversations.value = Array.isArray(list) ? list : []
  } finally {
    loading.value = false
  }
}

function onKeywordInput() {
  if (keywordTimer) clearTimeout(keywordTimer)
  keywordTimer = setTimeout(() => {
    loadThread()
  }, 250)
}

async function deleteConv() {
  const peerId = isAdmin.value ? activeUserId.value : conversations.value[0]?.userId
  if (!peerId) return
  try {
    await ElMessageBox.confirm(t('messageDeleteConvConfirm'), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      type: 'warning'
    })
  } catch {
    return
  }
  try {
    await messageDeleteConversation(peerId)
    ElMessage({ message: t('messageDeleted'), type: 'success', plain: true })
    threadMessages.value = []
    await loadConversations()
    if (isAdmin.value) {
      activeUserId.value = conversations.value[0]?.userId || null
      if (activeUserId.value) await loadThread()
    } else {
      activeUserId.value = conversations.value[0]?.userId || null
      await loadThread()
    }
    refreshUnread()
  } catch (e) {
    ElMessage({ message: e?.message || t('messageFailed'), type: 'error', plain: true })
  }
}

async function loadThread() {
  if (!activeUserId.value && isAdmin.value) {
    threadMessages.value = []
    return
  }
  threadLoading.value = true
  try {
    const params = {}
    if (isAdmin.value && activeUserId.value) {
      params.userId = activeUserId.value
    }
    const kw = String(keyword.value || '').trim()
    if (kw) params.keyword = kw
    const list = await messageList(params)
    const rows = Array.isArray(list) ? list : []
    threadMessages.value = rows
        .filter(item => !(item.msgType === 1 || item.fromUserId === 0))
        .slice()
        .reverse()
  } finally {
    threadLoading.value = false
  }
}

function messageClass(item) {
  return { 'is-mine': item.fromUserId === userStore.user?.userId }
}

function fromLabel(item) {
  if (item.fromUserId === userStore.user?.userId) return userStore.user?.email || 'me'
  return item.fromEmail || t('messageFromAdmin')
}

function startLivePoll() {
  stopLivePoll()
  // 打开站内信约 2 秒刷新，接近实时
  stopLivePollFn = startRealtimePoll(async () => {
    if (!panelVisible.value) return
    const prevIds = new Set(threadMessages.value.map(item => item.messageId))
    await loadConversations()
    await loadThread()
    await refreshUnread()
    const hasNew = threadMessages.value.some(item => !prevIds.has(item.messageId))
    if (hasNew) {
      markThreadRead()
      scrollToBottom()
    }
  }, 2000)
}

function stopLivePoll() {
  if (stopLivePollFn) {
    stopLivePollFn()
    stopLivePollFn = null
  }
  if (liveTimer) {
    clearInterval(liveTimer)
    liveTimer = null
  }
}

async function refreshUnread() {
  try {
    const data = await messageUnreadCount()
    uiStore.messageUnread = Number(data?.total) || 0
    uiStore.messageChatUnread = Number(data?.chat) || 0
    uiStore.messageSystemUnread = Number(data?.system) || 0
    maybePopupAnnounce(data)
  } catch {}
}

function markThreadRead() {
  const ids = threadMessages.value
      .filter(item => !item.isRead && item.toUserId === userStore.user?.userId)
      .map(item => item.messageId)

  const done = () => {
    threadMessages.value = threadMessages.value.map(item =>
        ids.includes(item.messageId) ? { ...item, isRead: 1 } : item
    )
    if (activeUserId.value) {
      conversations.value = conversations.value.map(item =>
          item.userId === activeUserId.value ? { ...item, unread: 0 } : item
      )
    }
    loadConversations()
    refreshUnread()
  }

  if (!ids.length) {
    refreshUnread()
    return
  }

  messageRead({ messageIds: ids }).then(done).catch(() => {
    refreshUnread()
  })
}

function scrollToBottom() {
  nextTick(() => {
    const el = listRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function send() {
  const content = String(draft.value || '').trim()
  if (!content) {
    ElMessage({ message: t('messageContentEmpty'), type: 'warning', plain: true })
    return
  }
  if (isAdmin.value && !activeUserId.value) {
    ElMessage({ message: t('messageSelectUser'), type: 'warning', plain: true })
    return
  }
  if (sending.value) return
  sending.value = true
  try {
    const payload = { content }
    if (isAdmin.value) payload.toUserId = activeUserId.value
    await messageSend(payload)
    draft.value = ''
    await Promise.all([loadThread(), loadConversations(), refreshUnread()])
    scrollToBottom()
  } catch (e) {
    ElMessage({ message: e?.message || t('messageFailed'), type: 'error', plain: true })
  } finally {
    sending.value = false
  }
}

onBeforeUnmount(() => {
  stopLivePoll()
  if (leaveTimer) clearTimeout(leaveTimer)
  if (keywordTimer) clearTimeout(keywordTimer)
})
</script>

<style lang="scss" scoped>
.msg-float-root {
  position: fixed;
  right: 18px;
  bottom: 24px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.msg-float-btn {
  display: flex;
  align-items: center;
  gap: 0;
  height: 44px;
  width: 44px;
  padding: 0;
  border-radius: 22px;
  background: linear-gradient(135deg, #1890ff, #3a80dd);
  color: #fff;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(24, 144, 255, 0.28);
  user-select: none;
  overflow: hidden;
  justify-content: center;
  transition: width 0.18s ease, box-shadow 0.18s ease, gap 0.18s ease, padding 0.18s ease;

  .msg-float-btn-text {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    max-width: 0;
    opacity: 0;
    overflow: hidden;
    transition: max-width 0.18s ease, opacity 0.15s ease;
  }

  &:hover,
  &.is-open {
    width: auto;
    min-width: 44px;
    padding: 0 14px 0 12px;
    gap: 8px;

    .msg-float-btn-text {
      max-width: 72px;
      opacity: 1;
    }
  }

  &.is-open {
    box-shadow: 0 10px 24px rgba(24, 144, 255, 0.35);
  }

  :deep(.el-badge__content) {
    transform: translateY(-4px) translateX(8px);
  }
}

.msg-float-panel {
  width: min(360px, calc(100vw - 28px));
  height: min(500px, calc(100vh - 150px));
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-size: 14px;

  &.is-admin-chat {
    width: min(640px, calc(100vw - 28px));
    flex-direction: row;
  }
}

.msg-friends {
  width: 220px;
  border-right: 1px solid var(--el-border-color);
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--el-fill-color-blank);
}

.msg-friends-head {
  padding: 12px 12px 6px;
  font-weight: 700;
}

.msg-friends-search {
  padding: 0 10px 8px;
  border-bottom: 1px solid var(--el-border-color);
}

.user-search {
  width: 120px;
}

.msg-friends-list {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.msg-friend-item {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &:hover {
    background: var(--el-fill-color-light);
  }

  &.active {
    background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
  }
}

.friend-avatar {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--el-color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex-shrink: 0;
}

.friend-main {
  min-width: 0;
  flex: 1;
}

.friend-name {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 2px;
}

.friend-email {
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.friend-preview {
  color: var(--regular-text-color);
  font-size: 12px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.msg-chat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.msg-float-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color);
}

.msg-float-title {
  font-weight: 700;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.msg-float-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.message-tip {
  padding: 6px 12px 0;
  color: var(--regular-text-color);
  font-size: 12px;
  line-height: 1.4;
}

.message-list {
  flex: 1;
  min-height: 0;
  margin: 8px 10px;
  overflow: auto;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--el-fill-color-blank);
}

.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.message-empty {
  text-align: center;
  color: var(--regular-text-color);
  padding: 36px 0;
}

.message-item {
  max-width: 94%;
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--el-fill-color-light);

  &.is-mine {
    align-self: flex-end;
    background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
  }
}

.message-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--regular-text-color);
}

.message-content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

.message-compose {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 10px 10px;

  .compose-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    align-items: end;
  }
}

.msg-pop-enter-active,
.msg-pop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s var(--cm-spring, ease);
}

.msg-pop-enter-from,
.msg-pop-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}

html.ui-motion-ios .msg-float-btn {
  transition: width .35s var(--cm-spring), box-shadow .3s ease, gap .3s var(--cm-spring), padding .3s var(--cm-spring);
}

html.ui-motion-ios .msg-float-btn:active {
  transform: scale(.92);
}

html.ui-motion-ios .msg-friend-item:active {
  transform: scale(.97);
}

@media (max-width: 720px) {
  .msg-float-panel.is-admin-chat {
    width: min(360px, calc(100vw - 28px));
  }

  .msg-friends {
    width: 120px;

    .friend-preview {
      display: none;
    }
  }
}
</style>
