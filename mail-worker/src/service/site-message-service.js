import orm from '../entity/orm';
import siteMessage from '../entity/site-message';
import user from '../entity/user';
import BizError from '../error/biz-error';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { isDel } from '../const/entity-const';

const siteMessageService = {

	msgType: {
		CHAT: 0,
		SYSTEM: 1
	},

	async getAdminUserId(c) {
		const adminRow = await orm(c).select({ userId: user.userId })
			.from(user)
			.where(sql`${user.email} COLLATE NOCASE = ${c.env.admin}`)
			.get();
		return adminRow?.userId || 0;
	},

	isAdminUser(c, userRow) {
		return !!userRow && !!userRow.email && userRow.email === c.env.admin;
	},

	async createMessage(c, { fromUserId = 0, toUserId, content, msgType = 0, refType = '' }) {
		if (!toUserId || !content || !String(content).trim()) {
			return null;
		}
		const row = await orm(c).insert(siteMessage).values({
			fromUserId: fromUserId || 0,
			toUserId,
			content: String(content).trim().slice(0, 2000),
			isRead: 0,
			msgType: msgType || 0,
			refType: refType || ''
		}).returning().get();
		return row;
	},

	async notifyAdmin(c, content, refType = '') {
		const adminUserId = await this.getAdminUserId(c);
		if (!adminUserId) return;
		await this.createMessage(c, {
			fromUserId: 0,
			toUserId: adminUserId,
			content,
			msgType: this.msgType.SYSTEM,
			refType
		});
	},

	async notifyUser(c, toUserId, content, refType = '') {
		if (!toUserId) return;
		await this.createMessage(c, {
			fromUserId: 0,
			toUserId,
			content,
			msgType: this.msgType.SYSTEM,
			refType
		});
	},

	async list(c, currentUserId, query = {}) {
		const userRow = await orm(c).select().from(user).where(eq(user.userId, currentUserId)).get();
		const adminUserId = await this.getAdminUserId(c);
		const isAdmin = this.isAdminUser(c, userRow);

		// 管理员：可查看与指定用户的会话，或全部；普通用户：仅与管理员往来 + 系统通知
		let conditions;
		if (isAdmin) {
			const peerUserId = Number(query.userId) || 0;
			if (peerUserId) {
				conditions = or(
					and(eq(siteMessage.fromUserId, peerUserId), eq(siteMessage.toUserId, adminUserId)),
					and(eq(siteMessage.fromUserId, adminUserId), eq(siteMessage.toUserId, peerUserId)),
					and(eq(siteMessage.fromUserId, 0), eq(siteMessage.toUserId, peerUserId)),
					and(eq(siteMessage.fromUserId, 0), eq(siteMessage.toUserId, adminUserId), sql`${siteMessage.refType} != ''`)
				);
			} else {
				// 管理员默认只看与自己相关的会话
				conditions = or(
					eq(siteMessage.toUserId, adminUserId),
					eq(siteMessage.fromUserId, adminUserId)
				);
			}
		} else {
			conditions = or(
				and(eq(siteMessage.fromUserId, currentUserId), eq(siteMessage.toUserId, adminUserId)),
				and(eq(siteMessage.fromUserId, adminUserId), eq(siteMessage.toUserId, currentUserId)),
				and(eq(siteMessage.fromUserId, 0), eq(siteMessage.toUserId, currentUserId))
			);
		}

		let rows = await orm(c).select({
			messageId: siteMessage.messageId,
			fromUserId: siteMessage.fromUserId,
			toUserId: siteMessage.toUserId,
			content: siteMessage.content,
			isRead: siteMessage.isRead,
			msgType: siteMessage.msgType,
			refType: siteMessage.refType,
			createTime: siteMessage.createTime,
			fromEmail: sql`case when ${siteMessage.fromUserId} = 0 then 'system' else (select email from user where user_id = ${siteMessage.fromUserId}) end`,
			toEmail: sql`(select email from user where user_id = ${siteMessage.toUserId})`
		}).from(siteMessage)
			.where(conditions)
			.orderBy(desc(siteMessage.messageId))
			.limit(200)
			.all();

		const keyword = String(query.keyword || query.q || '').trim().toLowerCase();
		if (keyword) {
			rows = rows.filter(row => {
				const content = String(row.content || '').toLowerCase();
				const from = String(row.fromEmail || '').toLowerCase();
				return content.includes(keyword) || from.includes(keyword);
			});
		}

		return rows;
	},

	async deleteConversation(c, currentUserId, peerUserId) {
		peerUserId = Number(peerUserId);
		if (!peerUserId) {
			throw new BizError('peerUserId不能为空');
		}

		const userRow = await orm(c).select().from(user).where(eq(user.userId, currentUserId)).get();
		const adminUserId = await this.getAdminUserId(c);
		const isAdmin = this.isAdminUser(c, userRow);

		if (!isAdmin && peerUserId !== adminUserId) {
			throw new BizError('无权删除该会话');
		}

		const conditions = [
			and(eq(siteMessage.fromUserId, peerUserId), eq(siteMessage.toUserId, adminUserId)),
			and(eq(siteMessage.fromUserId, adminUserId), eq(siteMessage.toUserId, peerUserId)),
			and(eq(siteMessage.fromUserId, 0), eq(siteMessage.toUserId, peerUserId))
		];
		if (!isAdmin) {
			conditions.push(and(eq(siteMessage.fromUserId, 0), eq(siteMessage.toUserId, currentUserId)));
		}

		await orm(c).delete(siteMessage).where(or(...conditions)).run();
	},

	async unreadCount(c, currentUserId) {
		const rows = await orm(c).select({
			msgType: siteMessage.msgType,
			count: sql`count(*)`
		})
			.from(siteMessage)
			.where(and(
				eq(siteMessage.toUserId, currentUserId),
				eq(siteMessage.isRead, 0)
			))
			.groupBy(siteMessage.msgType)
			.all();

		let total = 0;
		let chat = 0;
		let system = 0;
		(rows || []).forEach(row => {
			const n = Number(row.count) || 0;
			total += n;
			if (row.msgType === 1) system += n;
			else chat += n;
		});
		return { total, chat, system };
	},

	async markRead(c, currentUserId, params = {}) {
		// 打开会话面板：清掉当前用户全部聊天未读（不含系统通知）
		if (params.allChat) {
			await orm(c).update(siteMessage)
				.set({ isRead: 1 })
				.where(and(
					eq(siteMessage.toUserId, currentUserId),
					eq(siteMessage.isRead, 0),
					sql`(${siteMessage.msgType} = 0 AND ${siteMessage.fromUserId} != 0)`
				))
				.run();
			return;
		}

		if (params.all) {
			await orm(c).update(siteMessage)
				.set({ isRead: 1 })
				.where(and(
					eq(siteMessage.toUserId, currentUserId),
					eq(siteMessage.isRead, 0)
				))
				.run();
			return;
		}

		let ids = params.messageIds;
		if (typeof ids === 'string') {
			ids = ids.split(',').map(Number).filter(Boolean);
		}
		if (!Array.isArray(ids) || !ids.length) {
			return;
		}
		await orm(c).update(siteMessage)
			.set({ isRead: 1 })
			.where(and(
				inArray(siteMessage.messageId, ids),
				eq(siteMessage.toUserId, currentUserId)
			))
			.run();
	},

	async send(c, currentUserId, params) {
		const content = String(params?.content || '').trim();
		if (!content) {
			throw new BizError('消息内容不能为空');
		}
		if (content.length > 2000) {
			throw new BizError('消息过长');
		}

		const userRow = await orm(c).select().from(user).where(eq(user.userId, currentUserId)).get();
		if (!userRow || userRow.isDel === isDel.DELETE) {
			throw new BizError('用户不存在', 401);
		}

		const adminUserId = await this.getAdminUserId(c);
		const isAdmin = this.isAdminUser(c, userRow);

		let toUserId;
		if (isAdmin) {
			toUserId = Number(params.toUserId) || 0;
			if (!toUserId) {
				throw new BizError('请选择接收用户');
			}
			if (toUserId === adminUserId) {
				throw new BizError('不能发送给自己');
			}
			const target = await orm(c).select({ userId: user.userId, isDel: user.isDel })
				.from(user).where(eq(user.userId, toUserId)).get();
			if (!target || target.isDel === isDel.DELETE) {
				throw new BizError('接收用户不存在');
			}
		} else {
			// 普通用户只能发给管理员，禁止用户互发
			if (!adminUserId) {
				throw new BizError('管理员账号不存在');
			}
			toUserId = adminUserId;
		}

		return this.createMessage(c, {
			fromUserId: currentUserId,
			toUserId,
			content,
			msgType: this.msgType.CHAT,
			refType: ''
		});
	},

	async conversations(c, currentUserId) {
		const userRow = await orm(c).select().from(user).where(eq(user.userId, currentUserId)).get();
		const adminUserId = await this.getAdminUserId(c);
		const isAdmin = this.isAdminUser(c, userRow);

		if (!isAdmin) {
			if (!adminUserId) return [];
			const adminRow = await orm(c).select({
				userId: user.userId,
				email: user.email
			}).from(user).where(eq(user.userId, adminUserId)).get();
			if (!adminRow) return [];

			const msgs = await orm(c).select().from(siteMessage)
				.where(or(
					and(eq(siteMessage.fromUserId, currentUserId), eq(siteMessage.toUserId, adminUserId)),
					and(eq(siteMessage.fromUserId, adminUserId), eq(siteMessage.toUserId, currentUserId)),
					and(eq(siteMessage.fromUserId, 0), eq(siteMessage.toUserId, currentUserId))
				))
				.orderBy(desc(siteMessage.messageId))
				.all();

			const chatMsgs = msgs.filter(m => !(m.msgType === 1 || m.fromUserId === 0));
			const unread = msgs.filter(m => m.toUserId === currentUserId && m.isRead === 0).length;
			const last = chatMsgs[0] || msgs[0] || null;
			return [{
				userId: adminRow.userId,
				email: adminRow.email,
				lastContent: last?.content || '',
				lastTime: last?.createTime || '',
				unread
			}];
		}

		// 管理员：每位用户一个独立会话
		const userRows = await orm(c).select({
			userId: user.userId,
			email: user.email
		}).from(user)
			.where(and(eq(user.isDel, isDel.NORMAL), sql`${user.userId} != ${adminUserId}`))
			.orderBy(asc(user.userId))
			.all();

		const allMsgs = await orm(c).select().from(siteMessage)
			.where(or(
				eq(siteMessage.toUserId, adminUserId),
				eq(siteMessage.fromUserId, adminUserId)
			))
			.orderBy(desc(siteMessage.messageId))
			.all();

		return userRows.map(u => {
			const thread = allMsgs.filter(m =>
				(m.fromUserId === u.userId && m.toUserId === adminUserId)
				|| (m.fromUserId === adminUserId && m.toUserId === u.userId)
				|| (m.fromUserId === 0 && m.toUserId === u.userId && m.refType === 'forward_review')
			);
			const chatMsgs = thread.filter(m => !(m.msgType === 1 || m.fromUserId === 0));
			const unread = allMsgs.filter(m => m.fromUserId === u.userId && m.toUserId === adminUserId && m.isRead === 0).length;
			const last = chatMsgs[0] || thread[0] || null;
			return {
				userId: u.userId,
				email: u.email,
				lastContent: last?.content || '',
				lastTime: last?.createTime || '',
				unread
			};
		});
	},

	async contacts(c, currentUserId) {
		const userRow = await orm(c).select().from(user).where(eq(user.userId, currentUserId)).get();
		const adminUserId = await this.getAdminUserId(c);
		const isAdmin = this.isAdminUser(c, userRow);

		if (!isAdmin) {
			if (!adminUserId) return [];
			const adminRow = await orm(c).select({
				userId: user.userId,
				email: user.email,
				name: user.email
			}).from(user).where(eq(user.userId, adminUserId)).get();
			return adminRow ? [{ ...adminRow, role: 'admin' }] : [];
		}

		const rows = await orm(c).select({
			userId: user.userId,
			email: user.email,
			name: user.email
		}).from(user)
			.where(and(eq(user.isDel, isDel.NORMAL), sql`${user.userId} != ${adminUserId}`))
			.orderBy(asc(user.userId))
			.all();

		return rows.map(row => ({ ...row, role: 'user' }));
	}
};

export default siteMessageService;
