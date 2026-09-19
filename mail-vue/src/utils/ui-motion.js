/**
 * 界面动效模式：0=经典 classic，1=iOS 弹簧
 * 管理员在「系统设置」切换后写入 setting.ui_motion，经 websiteConfig 下发全站。
 */
export const UI_MOTION_CLASSIC = 0
export const UI_MOTION_IOS = 1

export function applyUiMotion(mode) {
    const html = document.documentElement
    const ios = Number(mode) === UI_MOTION_IOS
    html.classList.toggle('ui-motion-ios', ios)
    html.classList.toggle('ui-motion-classic', !ios)
    html.dataset.uiMotion = ios ? 'ios' : 'classic'
    return ios
}

export function applyDarkMode(isDark) {
    const html = document.documentElement
    // 只增删 dark，避免把 ui-motion-* 冲掉
    html.classList.toggle('dark', !!isDark)
    const metaTag = document.getElementById('theme-color-meta')
    const isMobile = !window.matchMedia('(pointer: fine) and (hover: hover)').matches
    if (metaTag) {
        metaTag.setAttribute(
            'content',
            isDark ? (isMobile ? '#141414' : '#000000') : (isMobile ? '#191A23' : '#F1F1F1')
        )
    }
}

export function isUiMotionIos(mode) {
    return Number(mode) === UI_MOTION_IOS
}

export default {
    UI_MOTION_CLASSIC,
    UI_MOTION_IOS,
    applyUiMotion,
    applyDarkMode,
    isUiMotionIos
}
