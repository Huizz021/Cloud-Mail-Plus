<template>
  <div class="box">
    <div class="container">
      <div class="title">{{$t('profile')}}</div>
      <div class="item">
        <div>{{$t('username')}}</div>
        <div>
          <span v-if="setNameShow" class="edit-name-input">
            <el-input v-model="accountName"  ></el-input>
            <span class="edit-name" @click="setName">
             {{$t('save')}}
            </span>
          </span>
          <span v-else class="user-name">
            <span >{{ userStore.user.name }}</span>
            <span class="edit-name" @click="showSetName">
             {{$t('change')}}
            </span>
          </span>
        </div>
      </div>
      <div class="item">
        <div>{{$t('emailAccount')}}</div>
        <div>{{ userStore.user.email }}</div>
      </div>
      <div class="item">
        <div>{{$t('password')}}</div>
        <div>
          <el-button type="primary" @click="pwdShow = true">{{$t('changePwdBtn')}}</el-button>
        </div>
      </div>
    </div>

    <div class="push-setting">
      <div class="title">{{ $t('userPushSetting') }}</div>
      <div class="push-desc">{{ $t('userPushSettingDesc') }}</div>
      <div class="push-list">
        <div class="push-item">
          <div class="push-label">{{ $t('otherEmail') }}</div>
          <div class="push-value">
            <span class="push-text">{{ forward.form.forwardEmail || $t('userForwardHint') }}</span>
            <span class="push-status">{{ forwardApplyLabel }}</span>
            <span v-if="forward.form.forwardEmail" class="push-status">{{ forward.form.forwardActive ? $t('forwardApplyActive') : $t('forwardApplyInactive') }}</span>
            <span v-if="forward.form.forwardError" class="push-error" :title="forward.form.forwardError">{{ $t('forwardError') }}</span>
            <el-button size="small" type="primary" @click="openForwardDialog('email')">{{ $t('change') }}</el-button>
          </div>
          <div v-if="forward.form.forwardError" class="push-error-desc">{{ $t('forwardErrorTip') }}</div>
        </div>
        <div class="push-item">
          <div class="push-label">{{ $t('tgBot') }}</div>
          <div class="push-value">
            <span class="push-text">{{ forward.form.tgChatId || $t('userForwardSysHint') }}</span>
            <span class="push-status">{{ forward.form.tgBotStatus === 0 ? $t('enabled') : $t('disabled') }}</span>
            <el-button size="small" type="primary" @click="openForwardDialog('tg')">{{ $t('change') }}</el-button>
          </div>
        </div>
        <div class="push-item">
          <div class="push-label">{{ $t('webhook') }}</div>
          <div class="push-value">
            <span class="push-text">{{ forward.form.webhookUrl || $t('userForwardSysHint') }}</span>
            <span class="push-status">{{ forward.form.webhookStatus === 0 ? $t('enabled') : $t('disabled') }}</span>
            <el-button size="small" type="primary" @click="openForwardDialog('webhook')">{{ $t('change') }}</el-button>
          </div>
        </div>
      </div>
    </div>

    <div class="language">
      <div class="title">{{$t('language')}}</div>
      <el-select
          :model-value="langSelect"
          class="language-select"
          placeholder="Select"
          @change="changeLang"
      >
        <el-option label="中文" value="zh" @pointerdown.prevent.stop="changeLang('zh')"/>
        <el-option label="English" value="en" @pointerdown.prevent.stop="changeLang('en')"/>
      </el-select>
    </div>
    <div class="del-email" v-perm="'my:delete'">
      <div class="title">{{$t('deleteUser')}}</div>
      <div class="del-desc">
        {{$t('delAccountMsg')}}
      </div>
      <div>
        <el-button type="primary" @click="deleteConfirm">{{$t('deleteUserBtn')}}</el-button>
      </div>
    </div>
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="340">
      <div class="update-pwd">
        <el-input type="password" :placeholder="$t('newPassword')" v-model="form.password" autocomplete="off" @keyup.enter="submitPwd"/>
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="form.newPwd" autocomplete="off" @keyup.enter="submitPwd"/>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{$t('save')}}</el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="forward.show" :title="forwardDialogTitle" width="360" @closed="closeForwardDialog">
      <div class="forward-form">
        <template v-if="forward.type === 'email'">
          <div class="forward-hint">{{ $t('otherEmailInputDesc') }}</div>
          <el-input-tag tag-type="warning" :placeholder="$t('otherEmailInputDesc')" v-model="forward.forwardEmailTags"/>
          <div class="forward-hint">{{ $t('forwardApplyDesc') }}</div>
          <div class="forward-hint">{{ forwardApplyLabel }}<template v-if="forward.form.forwardEmail"> · {{ forward.form.forwardActive ? $t('forwardApplyActive') : $t('forwardApplyInactive') }}</template></div>
        </template>
        <template v-else-if="forward.type === 'tg'">
          <div class="forward-hint">{{ $t('toBotTokenDesc') }}</div>
          <el-input-tag tag-type="warning" :placeholder="$t('tgChatId')" v-model="forward.tgChatIdTags"/>
          <div class="forward-hint">{{ $t('userForwardSysHint') }}</div>
        </template>
        <template v-else>
          <div class="forward-hint">{{ $t('webhookDesc') }}</div>
          <el-input :placeholder="$t('webhookUrl')" v-model="forward.form.webhookUrl"/>
          <el-input :placeholder="$t('webhookSecret')" v-model="forward.form.webhookSecret"/>
          <div class="webhook-retry">
            <span>{{ $t('webhookRetry') }}</span>
            <el-input-number v-model="forward.form.webhookRetry" :min="0" :max="5" controls-position="right"/>
          </div>
          <div class="forward-hint">{{ $t('userForwardSysHint') }}</div>
        </template>
      </div>
      <template #footer>
        <div class="forward-footer">
          <el-switch v-model="forwardSwitchValue" :active-value="0" :inactive-value="1" :active-text="$t('enable')"
                     :inactive-text="$t('disable')"/>
          <el-button type="primary" :loading="forward.loading" @click="saveForward">{{$t('save')}}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>
<script setup>
import {reactive, ref, computed, onMounted, defineOptions} from 'vue'
import {resetPassword, userDelete, myForwardQuery, myForwardSet} from "@/request/my.js";
import {useUserStore} from "@/store/user.js";
import router from "@/router/index.js";
import {accountSetName} from "@/request/account.js";
import {useAccountStore} from "@/store/account.js";
import {useI18n} from "vue-i18n";
import {useSettingStore} from "@/store/setting.js";
import {isEmail, isIpUrl} from "@/utils/verify-utils.js";

const { t } = useI18n()
const accountStore = useAccountStore()
const settingStore = useSettingStore()
const userStore = useUserStore();
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)
const langSelect = ref(settingStore.lang)

const forward = reactive({
  show: false,
  type: 'email',
  loading: false,
  forwardEmailTags: [],
  tgChatIdTags: [],
  form: {
    forwardEmail: '',
    forwardStatus: 1,
    forwardApply: 0,
    forwardActive: false,
    forwardError: '',
    forwardErrorTime: '',
    tgChatId: '',
    tgBotStatus: 1,
    webhookUrl: '',
    webhookStatus: 1,
    webhookRetry: 0,
    webhookSecret: ''
  }
})

const forwardApplyLabel = computed(() => {
  const map = {
    0: t('forwardApplyNone'),
    1: t('forwardApplyPending'),
    2: t('forwardApplyApproved'),
    3: t('forwardApplyRejected')
  }
  return map[forward.form.forwardApply] || t('forwardApplyNone')
})

const forwardDialogTitle = computed(() => {
  if (forward.type === 'email') return t('otherEmail')
  if (forward.type === 'tg') return t('tgBot')
  return t('webhook')
})

const forwardSwitchValue = computed({
  get() {
    if (forward.type === 'email') return forward.form.forwardStatus
    if (forward.type === 'tg') return forward.form.tgBotStatus
    return forward.form.webhookStatus
  },
  set(val) {
    if (forward.type === 'email') forward.form.forwardStatus = val
    else if (forward.type === 'tg') forward.form.tgBotStatus = val
    else forward.form.webhookStatus = val
  }
})

function applyForward(data) {
  const next = {
    forwardEmail: data?.forwardEmail || '',
    forwardStatus: data?.forwardStatus ?? 1,
    forwardApply: data?.forwardApply ?? 0,
    forwardActive: !!data?.forwardActive,
    forwardError: data?.forwardError || '',
    forwardErrorTime: data?.forwardErrorTime || '',
    tgChatId: data?.tgChatId || '',
    tgBotStatus: data?.tgBotStatus ?? 1,
    webhookUrl: data?.webhookUrl || '',
    webhookStatus: data?.webhookStatus ?? 1,
    webhookRetry: data?.webhookRetry ?? 0,
    webhookSecret: data?.webhookSecret || ''
  }
  Object.assign(forward.form, next)
  forward.forwardEmailTags = next.forwardEmail ? next.forwardEmail.split(',').filter(Boolean) : []
  forward.tgChatIdTags = next.tgChatId ? next.tgChatId.split(',').filter(Boolean) : []
}

function loadForward() {
  myForwardQuery().then(data => {
    applyForward(data)
  }).catch(() => {})
}

function openForwardDialog(type) {
  forward.type = type
  forward.show = true
}

function closeForwardDialog() {
  loadForward()
}

function saveForward() {
  if (forward.loading) return

  const payload = { ...forward.form }

  if (forward.type === 'email') {
    const emails = (forward.forwardEmailTags || []).map(item => String(item).trim()).filter(Boolean)
    const invalid = emails.find(item => !isEmail(item))
    if (invalid) {
      ElMessage({ message: t('notEmailMsg'), type: 'error', plain: true })
      return
    }
    payload.forwardEmail = emails.join(',')
    if (!payload.forwardEmail && payload.forwardStatus === 0) {
      payload.forwardStatus = 1
    }
  }

  if (forward.type === 'tg') {
    const chatIds = (forward.tgChatIdTags || []).map(item => String(item).trim()).filter(Boolean)
    payload.tgChatId = chatIds.join(',')
    if (!payload.tgChatId && payload.tgBotStatus === 0) {
      payload.tgBotStatus = 1
    }
  }

  if (forward.type === 'webhook') {
    const url = String(payload.webhookUrl || '').trim()
    if (url && isIpUrl(url)) {
      ElMessage({ message: t('webhookIpNotSupported'), type: 'error', plain: true })
      return
    }
    payload.webhookUrl = url
    if (!payload.webhookUrl && payload.webhookStatus === 0) {
      payload.webhookStatus = 1
    }
    payload.webhookRetry = Number(payload.webhookRetry) || 0
  }

  forward.loading = true
  myForwardSet(payload).then(data => {
    applyForward(data)
    forward.show = false
    ElMessage({
      message: data?.forwardApply === 1 ? t('forwardApplyPending') : t('saveSuccessMsg'),
      type: data?.forwardApply === 1 ? 'warning' : 'success',
      plain: true,
    })
  }).finally(() => {
    forward.loading = false
  })
}

defineOptions({
  name: 'setting'
})

function showSetName() {
  accountName.value = userStore.user.name
  setNameShow.value = true
}

function setName() {

  if (!accountName.value) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameShow.value = false
  let name = accountName.value

  if (name === userStore.user.name) {
    return
  }

  userStore.user.name = accountName.value

  accountSetName(userStore.user.account.accountId,name).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })

    accountStore.changeUserAccountName = name

  }).catch(() => {
    userStore.user.name = name
  })
}

function changeLang(lang) {
  let setting = {}
  try {
    setting = JSON.parse(localStorage.getItem('setting') || '{}')
  } catch (e) {
    setting = {}
  }
  localStorage.setItem('setting', JSON.stringify({...setting, lang}))
  window.location.reload()
}

const pwdShow = ref(false)
const form = reactive({
  password: '',
  newPwd: '',
})

const deleteConfirm = () => {
  ElMessageBox.confirm(t('delAccountConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete().then(() => {
      localStorage.removeItem('token');
      router.replace('/login');
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  })
}


function submitPwd() {

  if (setPwdLoading.value) return

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password !== form.newPwd) {
    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  setPwdLoading.value = true
  resetPassword(form.password).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })
    pwdShow.value = false
    setPwdLoading.value = false
    form.password = ''
    form.newPwd = ''
  }).catch(() => {
    setPwdLoading.value = false
  })

}

onMounted(() => {
  loadForward()
})

</script>
<style scoped lang="scss">
.box {
  padding: 40px 40px;

  @media (max-width: 767px) {
    padding: 30px 30px;
  }

  .update-pwd {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .title {
    font-size: 18px;
    font-weight: bold;
    color: var(--el-text-color-primary);
  }

  .container {
    font-size: 14px;
    display: grid;
    gap: 20px;
    margin-bottom: 40px;

    .item {
      display: grid;
      grid-template-columns: 50px 1fr;
      gap: 140px;
      position: relative;
      .user-name {
        display: grid;
        grid-template-columns: auto 1fr;
        span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      .edit-name-input {
        position: absolute;
        bottom: -6px;
        .el-input {
          width: min(200px,calc(100vw - 222px));
        }
      }

      .edit-name {
        color: #4dabff;
        padding-left: 10px;
        cursor: pointer;
      }

      @media (max-width: 767px) {
        gap: 70px;
      }

      div:first-child {
        font-weight: bold;
        color: var(--el-text-color-primary);
      }

      div:last-child {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: var(--el-text-color-primary);
      }
    }
  }

  .push-setting {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 40px;

    .push-desc {
      color: var(--regular-text-color);
    }

    .push-list {
      display: grid;
      gap: 16px;
    }

    .push-item {
      display: grid;
      gap: 8px;
    }

    .push-label {
      font-weight: bold;
    }

    .push-value {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }

    .push-text {
      min-width: 0;
      max-width: min(420px, 100%);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .push-status {
      color: var(--regular-text-color);
    }

    .push-error {
      color: var(--el-color-danger);
      font-size: 12px;
      cursor: help;
    }

    .push-error-desc {
      color: var(--el-color-danger);
      font-size: 12px;
    }
  }

  .forward-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .forward-hint {
    color: var(--regular-text-color);
    font-size: 12px;
  }

  .webhook-retry {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .forward-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .language {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 40px;

    .language-select {
      width: 100px;
    }
  }

  .del-email {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    color: var(--el-text-color-primary);

    .title {
      color: var(--el-text-color-primary);
    }

    .del-desc {
      color: var(--regular-text-color);
    }
  }
}
</style>

<style>
/* 暗色：个人设置正文必须是浅色（不受 scoped 变量缓存影响） */
html.dark .box,
html.dark .box .title,
html.dark .box .container,
html.dark .box .item,
html.dark .box .item > div,
html.dark .box .item span,
html.dark .box .push-setting,
html.dark .box .push-label,
html.dark .box .push-text,
html.dark .box .language,
html.dark .box .del-email {
  color: #f2f4f8 !important;
}

html.dark .box .push-status,
html.dark .box .push-desc,
html.dark .box .del-desc,
html.dark .box .forward-hint {
  color: #c0c5ce !important;
}

html.dark .box .edit-name {
  color: #69c0ff !important;
}
</style>
