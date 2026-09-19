import { notifySwipe } from '@/utils/notify-swipe.js'
import i18n from '@/i18n/index.js'

const ANNOUNCE_KEY = 'cloud-mail-announce-version'

function notifyAnnounce(payload) {
    const title = String(payload?.announceTitle || payload?.title || '').trim()
    const content = String(payload?.announceContent || payload?.message || payload?.content || '').trim()
    if (!title && !content) return false
    const type = payload?.announceType || payload?.type || 'info'
    notifySwipe({
        title: title || i18n.global.t('siteAnnouncement'),
        message: content,
        html: true,
        type: type === 'none' ? 'info' : type
    })
    return true
}

export function getAnnounceVersion(payload) {
    return String(payload?.announceVersion ?? payload?.noticeVersion ?? '0')
}

export function readShownAnnounceVersion() {
    return localStorage.getItem(ANNOUNCE_KEY) || ''
}

export function markAnnounceShown(version) {
    localStorage.setItem(ANNOUNCE_KEY, String(version ?? '0'))
}

/**
 * 进入系统 / 轮询发现新公告版本时弹窗（与通知中心并存）
 */
export function maybePopupAnnounce(payload) {
    if (!payload) return false
    const version = getAnnounceVersion(payload)
    const body = String(payload.announceContent || payload.announceTitle || '').trim()
    if (!body) return false
    const last = readShownAnnounceVersion()
    if (!version || version === '0') {
        // 无版本字段时，若有内容且尚未展示过该内容哈希则弹一次（避免每次进入都弹公告）
        return false
    }
    if (last === version) return false
    const ok = notifyAnnounce(payload)
    if (ok) markAnnounceShown(version)
    return ok
}

/**
 * 兼容：设置对象（websiteConfig）
 */
export function maybePopupAnnounceFromSettings(settings) {
    return maybePopupAnnounce({
        announceVersion: settings?.announceVersion,
        announceTitle: settings?.announceTitle,
        announceContent: settings?.announceContent,
        announceType: settings?.announceType
    })
}

export default maybePopupAnnounce
