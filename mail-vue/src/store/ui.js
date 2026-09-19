import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
    state: () => ({
        asideShow: window.innerWidth > 1024,
        accountShow: false,
        backgroundLoading: true,
        changeNotice: 0,
        writerRef: null,
        changePreview: 0,
        previewData: {},
        key: 0,
        dark: false,
        forwardReviewPending: 0,
        openForwardReviewAt: 0,
        messageUnread: 0,
        messageChatUnread: 0,
        messageSystemUnread: 0,
        messageCenterOpen: 0,
        messageCenterTab: 'chat',
        asideCount: {
            email: 0,
            send: 0,
            sysEmail: 0
        }
    }),
    actions: {
        showNotice() {
            this.changeNotice ++
        },
        previewNotice(data) {
            this.previewData = data
            this.changePreview ++
        },
        openForwardReview() {
            this.openForwardReviewAt ++
        },
        openMessageCenter(tab = 'chat') {
            this.messageCenterTab = tab
            this.messageCenterOpen ++
        }
    },
    persist: {
        pick: ['accountShow','dark'],
    },
})
