import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
const user = sqliteTable('user', {
	userId: integer('user_id').primaryKey({ autoIncrement: true }),
	email: text('email').notNull(),
	type: integer('type').default(1).notNull(),
	password: text('password').notNull(),
	salt: text('salt').notNull(),
	status: integer('status').default(0).notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`),
	activeTime: text('active_time'),
	createIp: text('create_ip'),
	activeIp: text('active_ip'),
	os: text('os'),
	browser: text('browser'),
	device: text('device'),
	sort: text('sort').default(0),
	sendCount: text('send_count').default(0),
	regKeyId: integer('reg_key_id').default(0).notNull(),
	isDel: integer('is_del').default(0).notNull(),
	forwardEmail: text('forward_email').default('').notNull(),
	forwardStatus: integer('forward_status').default(1).notNull(),
	forwardApply: integer('forward_apply').default(0).notNull(),
	forwardError: text('forward_error').default('').notNull(),
	forwardErrorTime: text('forward_error_time').default('').notNull(),
	tgChatId: text('tg_chat_id').default('').notNull(),
	tgBotStatus: integer('tg_bot_status').default(1).notNull(),
	webhookUrl: text('webhook_url').default('').notNull(),
	webhookStatus: integer('webhook_status').default(1).notNull(),
	webhookRetry: integer('webhook_retry').default(0).notNull(),
	webhookSecret: text('webhook_secret').default('').notNull()
});
export default user
