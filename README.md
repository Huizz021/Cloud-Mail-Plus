# Cloud Mail Plus

基于 [maillab/cloud-mail](https://github.com/maillab/cloud-mail) 的 **Cloudflare 邮箱增强版**（MIT）。

在原项目的收发信、多用户、RBAC 等能力之上，强化了 **多用户下的邮件转发治理**、**管理员与用户沟通**，以及 **更清晰的管理端/用户端界面**。

> **原项目 / 上游**：https://github.com/maillab/cloud-mail  
> **许可证**：MIT

---

## 与原项目的主要差异

| 能力 | 原项目 | 本增强版 |
|------|--------|----------|
| 第三方邮箱转发 | 系统级，易全站转发到同一地址 | **按用户配置**，可配多个目标；未配置不转发 |
| 转发管控 | 无审批 | **申请 → 管理员审批 → 生效**；可展示 Cloudflare Destination 验证状态 |
| 转发异常 | 仅日志 | 用户/管理员站内信提醒，个人设置可见失败状态 |
| TG / Webhook | 系统级 | **用户级优先**，未配置时回退系统（运维旁路） |
| 沟通 | 无 | **站内信**：仅用户 ↔ 管理员，禁止用户互发；管理员端好友列表 + 独立会话 |
| 公告 | 系统通知 | **全站公告**与**登录弹窗**文案分离；公告可站内信 + 用户端弹窗 |
| 界面 | 原布局 | 可切换 **经典 / iOS**；iOS 为深色侧栏 + 系统设置分区导航 |
| 通知 | — | 近实时轮询（约 2s）；弹层 5 秒右滑、可按住拖拽关闭 |

---

## 功能摘要

### 用户

- 在「个人设置 → 邮件推送」配置第三方邮箱 / Telegram / Webhook  
- 查看转发状态（未申请 / 待审批 / 已通过 / 生效 / 失败）  
- 与管理员站内信沟通  
- 接收系统通知、全站公告弹窗  

### 管理员

- 系统设置：注册、邮件、推送、CF 验证、存储、OAuth、公告等  
- **转发审批**：通过 / 拒绝；可选 CF API 查看目标邮箱是否已验证  
- 站内信：按用户独立会话  
- 发布全站公告、配置登录弹窗与首页 Hero 文案  
- 界面动效：经典 / iOS  

---

## 技术栈

- Cloudflare Workers + Hono  
- D1（SQLite）、KV、可选 R2  
- Email Routing（收信）  
- Vue 3 + Element Plus（前端）  
- Drizzle ORM  

部署文档可参考上游：https://doc.skymail.ink  

---

## 快速开始（Cloudflare）

1. Fork / 克隆本仓库  
2. 配置 `mail-worker/wrangler.toml`：`domain`、`admin`、`jwt_secret`、D1、KV  
3. 构建前端并部署 Worker（见上游部署文档）  
4. 访问 `/init/<jwt_secret>` 初始化/迁移数据库  
5. 在 Cloudflare Email Routing 中配置收信与 Destination  
6. （可选）配置 `cf_api_token`、`cf_zone_id`，审批列表可显示 CF 验证状态  
7. 使用 `admin` 邮箱登录，在系统设置中按需开启功能  

**重要**：升级后请执行一次 `/init/<jwt_secret>`，否则可能缺少新字段（转发审批、站内信、公告等）。

---

## 目录结构（与上游一致）

```
cloud-mail
├── mail-worker    # Workers 后端
├── mail-vue       # Vue 前端
└── doc            # 文档与演示资源
```

---

## 说明与限制

- 用户级第三方邮件转发仍依赖 **Cloudflare Destination 验证**；未验证时转发会失败（系统会提醒）。  
- 站内信为 D1 轮询近实时，非 WebSocket；小规模场景一般足够。  
- 本仓库为社区增强版，与上游可能存在功能与 API 差异。  

---

## 致谢

感谢 [maillab/cloud-mail](https://github.com/maillab/cloud-mail) 提供优秀的开源 Cloudflare 邮箱基础项目。

## 许可证

MIT License。详见 [LICENSE](./LICENSE)。使用、修改与分发时请遵守 MIT，并保留上游版权声明。
