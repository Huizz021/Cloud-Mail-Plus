/** 近实时轮询间隔（毫秒）— Cloudflare 无 WebSocket 时用短轮询逼近实时 */
export const REALTIME_POLL_MS = 2500
export const REALTIME_POLL_PANEL_MS = 2000

/**
 * 基于 document.visibility 的安全轮询
 * - 页面隐藏时暂停，回到前台立刻执行一次再继续
 */
export function startRealtimePoll(fn, intervalMs = REALTIME_POLL_MS) {
    let timer = null
    let stopped = false

    const run = () => {
        if (stopped || document.hidden) return
        try { fn?.() } catch { /* ignore */ }
    }

    const tick = () => {
        run()
        if (!stopped) {
            timer = window.setTimeout(tick, intervalMs)
        }
    }

    const onVisible = () => {
        if (!document.hidden) run()
    }

    timer = window.setTimeout(tick, 200)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
        stopped = true
        if (timer) clearTimeout(timer)
        document.removeEventListener('visibilitychange', onVisible)
    }
}

export default startRealtimePoll
