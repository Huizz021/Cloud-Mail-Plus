import { sqliteTable, text, integer} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const siteMessage = sqliteTable('site_message', {
	messageId: integer('message_id').primaryKey({ autoIncrement: true }),
	fromUserId: integer('from_user_id').notNull().default(0),
	toUserId: integer('to_user_id').notNull(),
	content: text('content').notNull(),
	isRead: integer('is_read').default(0).notNull(),
	msgType: integer('msg_type').default(0).notNull(),
	refType: text('ref_type').default('').notNull(),
	createTime: text('create_time').default(sql`CURRENT_TIMESTAMP`)
});

export default siteMessage;
