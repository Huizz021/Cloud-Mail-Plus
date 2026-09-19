import http from '@/axios/index.js'

export function messageList(params) {
    return http.get('/message/list', { params: { ...params } })
}

export function messageDeleteConversation(userId) {
    return http.delete('/message/conversation', { params: { userId } })
}

export function messageUnreadCount() {
    return http.get('/message/unreadCount')
}

export function messageContacts() {
    return http.get('/message/contacts')
}

export function messageConversations() {
    return http.get('/message/conversations')
}

export function messageSend(params) {
    return http.post('/message/send', params)
}

export function messageRead(params) {
    return http.put('/message/read', params || { all: true })
}
