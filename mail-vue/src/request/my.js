import http from '@/axios/index.js';

export function loginUserInfo() {
    return http.get('/my/loginUserInfo')
}

export function resetPassword(password) {
    return http.put('/my/resetPassword', {password})
}

export function userDelete() {
    return http.delete('/my/delete')
}

export function myForwardQuery() {
    return http.get('/my/forward')
}

export function myForwardSet(forward) {
    return http.put('/my/forward', forward)
}

