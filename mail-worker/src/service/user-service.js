import BizError from '../error/biz-error';
import accountService from './account-service';
import orm from '../entity/orm';
import user from '../entity/user';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { emailConst, isDel, roleConst, settingConst, userConst } from '../const/entity-const';
import kvConst from '../const/kv-const';
import KvConst from '../const/kv-const';
import cryptoUtils from '../utils/crypto-utils';
import emailService from './email-service';
import dayjs from 'dayjs';
import permService from './perm-service';
import roleService from './role-service';
import emailUtils from '../utils/email-utils';
import saltHashUtils from '../utils/crypto-utils';
import constant from '../const/constant';
import { t } from '../i18n/i18n'
import reqUtils from '../utils/req-utils';
import {oauth} from "../entity/oauth";
import oauthService from "./oauth-service";
import settingService from './setting-service';
import starService from './star-service';
import domainUtils from '../utils/domain-uitls';
import siteMessageService from './site-message-service';
import cfVerifyService from './cf-verify-service';

const userService = {

	async loginUserInfo(c, userId) {

		const userRow = await userService.selectById(c, userId);

		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}

		const [account, roleRow, permKeys] = await Promise.all([
			accountService.selectByEmailIncludeDel(c, userRow.email),
			roleService.selectById(c, userRow.type),
			userRow.email === c.env.admin ? Promise.resolve(['*']) : permService.userPermKeys(c, userId)
		]);

		const user = {};
		user.userId = userRow.userId;
		user.sendCount = userRow.sendCount;
		user.email = userRow.email;
		user.account = account;
		user.name = account.name;
		user.permKeys = permKeys;
		user.role = roleRow;
		user.type = userRow.type;
		user.forwardEmail = userRow.forwardEmail || '';
		user.forwardStatus = userRow.forwardStatus ?? 1;
		user.forwardApply = userRow.forwardApply ?? 0;
		user.forwardError = userRow.forwardError || '';
		user.forwardErrorTime = userRow.forwardErrorTime || '';
		user.tgChatId = userRow.tgChatId || '';
		user.tgBotStatus = userRow.tgBotStatus ?? 1;
		user.webhookUrl = userRow.webhookUrl || '';
		user.webhookStatus = userRow.webhookStatus ?? 1;
		user.webhookRetry = userRow.webhookRetry ?? 0;
		user.webhookSecret = userRow.webhookSecret || '';

		if (c.env.admin === userRow.email) {
			user.role = constant.ADMIN_ROLE
			user.type = 0;
		}

		return user;
	},


	async resetPassword(c, params, userId) {

		const { password } = params;

		if (password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}
		const { salt, hash } = await cryptoUtils.hashPassword(password);
		await orm(c).update(user).set({ password: hash, salt: salt }).where(eq(user.userId, userId)).run();
	},

	toForwardDto(userRow) {
		const forwardApply = userRow.forwardApply ?? settingConst.forwardApply.NONE;
		const forwardEmail = userRow.forwardEmail || '';
		const forwardStatus = userRow.forwardStatus ?? 1;
		const forwardActive = !!forwardEmail
			&& forwardStatus === settingConst.forwardStatus.OPEN
			&& forwardApply === settingConst.forwardApply.APPROVED;
		return {
			forwardEmail,
			forwardStatus,
			forwardApply,
			forwardActive,
			forwardError: userRow.forwardError || '',
			forwardErrorTime: userRow.forwardErrorTime || '',
			tgChatId: userRow.tgChatId || '',
			tgBotStatus: userRow.tgBotStatus ?? 1,
			webhookUrl: userRow.webhookUrl || '',
			webhookStatus: userRow.webhookStatus ?? 1,
			webhookRetry: userRow.webhookRetry ?? 0,
			webhookSecret: userRow.webhookSecret || ''
		};
	},

	async getForward(c, userId) {
		const userRow = await this.selectById(c, userId);
		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}
		return this.toForwardDto(userRow);
	},

	async setForward(c, params, userId) {

		const userRow = await this.selectById(c, userId);
		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}

		let forwardEmail = params.forwardEmail;
		if (Array.isArray(forwardEmail)) {
			forwardEmail = forwardEmail.join(',');
		}
		if (typeof forwardEmail === 'string') {
			forwardEmail = forwardEmail.split(',').map(item => item.trim()).filter(Boolean).join(',');
		} else {
			forwardEmail = userRow.forwardEmail || '';
		}

		let tgChatId = params.tgChatId;
		if (Array.isArray(tgChatId)) {
			tgChatId = tgChatId.join(',');
		}
		if (typeof tgChatId === 'string') {
			tgChatId = tgChatId.split(',').map(item => item.trim()).filter(Boolean).join(',');
		} else {
			tgChatId = userRow.tgChatId || '';
		}

		let webhookUrl = params.webhookUrl;
		if (typeof webhookUrl === 'string') {
			webhookUrl = domainUtils.toOssDomain(webhookUrl) || '';
		} else {
			webhookUrl = userRow.webhookUrl || '';
		}

		let webhookSecret = params.webhookSecret;
		if (typeof webhookSecret !== 'string') {
			webhookSecret = userRow.webhookSecret || '';
		}

		let webhookRetry = params.webhookRetry;
		webhookRetry = Number(webhookRetry);
		if (isNaN(webhookRetry) || webhookRetry < 0) {
			webhookRetry = userRow.webhookRetry ?? 0;
		}

		const oldEmail = (userRow.forwardEmail || '').trim();
		const newEmail = forwardEmail.trim();
		let forwardApply = userRow.forwardApply ?? settingConst.forwardApply.NONE;

		if (!newEmail) {
			forwardApply = settingConst.forwardApply.NONE;
		} else if (newEmail !== oldEmail || forwardApply === settingConst.forwardApply.NONE
			|| forwardApply === settingConst.forwardApply.REJECTED) {
			// 地址变更或重新提交：进入待审批，未通过前不转发
			forwardApply = settingConst.forwardApply.PENDING;
		}

		const data = {
			forwardEmail,
			forwardStatus: params.forwardStatus === settingConst.forwardStatus.OPEN
				? settingConst.forwardStatus.OPEN
				: settingConst.forwardStatus.CLOSE,
			forwardApply,
			tgChatId,
			tgBotStatus: params.tgBotStatus === settingConst.tgBotStatus.OPEN
				? settingConst.tgBotStatus.OPEN
				: settingConst.tgBotStatus.CLOSE,
			webhookUrl,
			webhookStatus: params.webhookStatus === settingConst.webhookStatus.OPEN
				? settingConst.webhookStatus.OPEN
				: settingConst.webhookStatus.CLOSE,
			webhookRetry,
			webhookSecret
		};

		if (!data.forwardEmail) {
			data.forwardStatus = settingConst.forwardStatus.CLOSE;
		}
		if (!data.tgChatId) {
			data.tgBotStatus = settingConst.tgBotStatus.CLOSE;
		}
		if (!data.webhookUrl) {
			data.webhookStatus = settingConst.webhookStatus.CLOSE;
		}

		await orm(c).update(user).set(data).where(eq(user.userId, userId)).run();

		if (forwardApply === settingConst.forwardApply.PENDING && newEmail) {
			try {
				await siteMessageService.notifyAdmin(c, `用户 ${userRow.email} 申请邮件转发：${newEmail}，请先在 Cloudflare 验证后审批`, 'forward_review');
			} catch (e) {
				console.error('forward pending notify fail', e);
			}
		}

		return this.toForwardDto({ ...userRow, ...data });
	},

	async listForward(c) {
		const rows = await orm(c).select({
			userId: user.userId,
			email: user.email,
			forwardEmail: user.forwardEmail,
			forwardStatus: user.forwardStatus,
			forwardApply: user.forwardApply,
			forwardError: user.forwardError,
			forwardErrorTime: user.forwardErrorTime,
			isDel: user.isDel
		}).from(user).where(eq(user.isDel, isDel.NORMAL)).orderBy(desc(user.userId)).all();

		// Cloudflare Destination 验证状态（未配置 API 时 configured=false）
		const allEmails = rows
			.map(row => row.forwardEmail || '')
			.join(',')
			.split(',')
			.map(item => item.trim())
			.filter(Boolean);
		const cfResult = await cfVerifyService.checkAddresses(c.env, [...new Set(allEmails)]);

		return {
			cfConfigured: cfResult.configured,
			cfError: cfResult.error || '',
			cfMap: cfResult.map || {},
			list: rows.map(row => ({
				userId: row.userId,
				email: row.email,
				forwardEmail: row.forwardEmail || '',
				forwardStatus: row.forwardStatus ?? 1,
				forwardApply: row.forwardApply ?? settingConst.forwardApply.NONE,
				forwardError: row.forwardError || '',
				forwardErrorTime: row.forwardErrorTime || '',
				forwardActive: !!(row.forwardEmail)
					&& row.forwardStatus === settingConst.forwardStatus.OPEN
					&& (row.forwardApply ?? settingConst.forwardApply.NONE) === settingConst.forwardApply.APPROVED,
				cfStatus: (row.forwardEmail || '')
					.split(',')
					.map(item => item.trim())
					.filter(Boolean)
					.map(addr => ({
						address: addr,
						status: cfResult.map?.[addr.toLowerCase()] || (cfResult.configured ? 'unknown' : 'unconfigured')
					}))
			}))
		};
	},

	async reviewForward(c, params) {
		const userId = Number(params.userId);
		const approved = params.approved === true || params.approved === 'true' || params.approved === 1;

		if (!userId) {
			throw new BizError('userId不能为空');
		}

		const userRow = await this.selectById(c, userId);
		if (!userRow) {
			throw new BizError(t('notExistUser'));
		}

		if (!userRow.forwardEmail) {
			throw new BizError('该用户未填写转发邮箱');
		}

		const forwardApply = approved
			? settingConst.forwardApply.APPROVED
			: settingConst.forwardApply.REJECTED;

		await orm(c).update(user)
			.set({
				forwardApply,
				forwardStatus: approved
					? settingConst.forwardStatus.OPEN
					: settingConst.forwardStatus.CLOSE
			})
			.where(eq(user.userId, userId))
			.run();

		try {
			const tip = approved
				? `你的邮件转发申请已通过：${userRow.forwardEmail}，已生效`
				: `你的邮件转发申请被拒绝：${userRow.forwardEmail}`;
			await siteMessageService.notifyUser(c, userId, tip, 'forward_review');
		} catch (e) {
			console.error('forward review notify fail', e);
		}

		return {
			userId,
			email: userRow.email,
			forwardEmail: userRow.forwardEmail,
			forwardApply,
			forwardStatus: approved ? settingConst.forwardStatus.OPEN : settingConst.forwardStatus.CLOSE
		};
	},

	selectByEmail(c, email) {
		return orm(c).select().from(user).where(
			and(
				sql`${user.email} COLLATE NOCASE = ${email}`,
				eq(user.isDel, isDel.NORMAL)))
			.get();
	},

	async insert(c, params) {
		const { userId } = await orm(c).insert(user).values({ ...params }).returning().get();
		return userId;
	},

	selectByEmailIncludeDel(c, email) {
		return orm(c).select().from(user).where(sql`${user.email} COLLATE NOCASE = ${email}`).get();
	},

	selectByIdIncludeDel(c, userId) {
		return orm(c).select().from(user).where(eq(user.userId, userId)).get();
	},

	selectById(c, userId) {
		return orm(c).select().from(user).where(
			and(
				eq(user.userId, userId),
				eq(user.isDel, isDel.NORMAL)))
			.get();
	},

	async delete(c, userId) {
		const { syncDelete } = await settingService.query(c);
		if (syncDelete === settingConst.syncDelete.OPEN) {
			await this.physicsDelete(c, { userIds: String(userId) });
			await c.env.kv.delete(kvConst.AUTH_INFO + userId)
			return;
		}
		await orm(c).update(user).set({ isDel: isDel.DELETE }).where(eq(user.userId, userId)).run();
		await c.env.kv.delete(kvConst.AUTH_INFO + userId)
	},

	async physicsDelete(c, params) {
		let { userIds } = params;
		userIds = userIds.split(',').map(Number);
		await starService.removeByUserIds(c, userIds);
		await accountService.physicsDeleteByUserIds(c, userIds);
		await oauthService.deleteByUserIds(c, userIds);
		await orm(c).delete(user).where(inArray(user.userId, userIds)).run();
	},

	async list(c, params) {

		let { num, size, email, timeSort, status } = params;

		size = Number(size);
		num = Number(num);
		timeSort = Number(timeSort);
		params.isDel = Number(params.isDel);

		if (isNaN(size)) {
			size = 50;
		}

		if (isNaN(num)) {
			num = 1;
		}

		if (size > 50) {
			size = 50;
		}

		num = (num - 1) * size;

		const conditions = [];

		if (status > -1) {
			conditions.push(eq(user.status, status));
			conditions.push(eq(user.isDel, isDel.NORMAL));
		}


		if (email) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${email + '%'}`);
		}


		if (params.isDel) {
			conditions.push(eq(user.isDel, params.isDel));
		}


		const query = orm(c).select({
			...user,
			username: oauth.username,
			trustLevel: oauth.trustLevel,
			avatar: oauth.avatar,
			name: oauth.name,
			platform: oauth.platform
		}).from(user).leftJoin(oauth, eq(oauth.userId, user.userId))
			.where(and(...conditions));


		if (timeSort) {
			query.orderBy(asc(user.userId));
		} else {
			query.orderBy(desc(user.userId));
		}

		const list = await query.limit(size).offset(num);

		const { total } = await orm(c)
			.select({ total: count() })
			.from(user)
			.where(and(...conditions)).get();
		const userIds = list.map(user => user.userId);

		const types = [...new Set(list.map(user => user.type))];

		const [emailCounts, delEmailCounts, sendCounts, delSendCounts, accountCounts, delAccountCounts, roleList] = await Promise.all([
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.RECEIVE),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.RECEIVE, isDel.DELETE),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.SEND),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.SEND, isDel.DELETE),
			accountService.selectUserAccountCountList(c, userIds),
			accountService.selectUserAccountCountList(c, userIds, isDel.DELETE),
			roleService.selectByIdsHasPermKey(c, types,'email:send')
		]);

		const receiveMap = Object.fromEntries(emailCounts.map(item => [item.userId, item.count]));
		const sendMap = Object.fromEntries(sendCounts.map(item => [item.userId, item.count]));
		const accountMap = Object.fromEntries(accountCounts.map(item => [item.userId, item.count]));

		const delReceiveMap = Object.fromEntries(delEmailCounts.map(item => [item.userId, item.count]));
		const delSendMap = Object.fromEntries(delSendCounts.map(item => [item.userId, item.count]));
		const delAccountMap = Object.fromEntries(delAccountCounts.map(item => [item.userId, item.count]));

		for (const user of list) {

			const userId = user.userId;

			user.receiveEmailCount = receiveMap[userId] || 0;
			user.sendEmailCount = sendMap[userId] || 0;
			user.accountCount = accountMap[userId] || 0;

			user.delReceiveEmailCount = delReceiveMap[userId] || 0;
			user.delSendEmailCount = delSendMap[userId] || 0;
			user.delAccountCount = delAccountMap[userId] || 0;

			const roleIndex = roleList.findIndex(roleRow => user.type === roleRow.roleId);
			let sendAction = {};

			if (roleIndex > -1) {
				sendAction.sendType = roleList[roleIndex].sendType;
				sendAction.sendCount = roleList[roleIndex].sendCount;
				sendAction.hasPerm = true;
			} else {
				sendAction.hasPerm = false;
			}

			if (user.email === c.env.admin) {
				sendAction.sendType = constant.ADMIN_ROLE.sendType;
				sendAction.sendCount = constant.ADMIN_ROLE.sendCount;
				sendAction.hasPerm = true;
				user.type = 0
			}

			user.sendAction = sendAction;
		}

		return { list, total };
	},

	async updateUserInfo(c, userId, recordCreateIp = false) {



		const activeIp = reqUtils.getIp(c);

		const {os, browser, device} = reqUtils.getUserAgent(c);

		const params = {
			os,
			browser,
			device,
			activeIp,
			activeTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
		};

		if (recordCreateIp) {
			params.createIp = activeIp;
		}

		await orm(c)
			.update(user)
			.set(params)
			.where(eq(user.userId, userId))
			.run();
	},

	async setPwd(c, params) {

		const { password, userId } = params;
		await this.resetPassword(c, { password }, userId);
		await c.env.kv.delete(KvConst.AUTH_INFO + userId);
	},

	async setStatus(c, params) {

		const { status, userId } = params;

		await orm(c)
			.update(user)
			.set({ status })
			.where(eq(user.userId, userId))
			.run();

		if (status === userConst.status.BAN) {
			await c.env.kv.delete(KvConst.AUTH_INFO + userId);
		}
	},

	async setType(c, params) {

		const { type, userId } = params;

		const roleRow = await roleService.selectById(c, type);

		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		await orm(c)
			.update(user)
			.set({ type })
			.where(eq(user.userId, userId))
			.run();

	},

	async incrUserSendCount(c, quantity, userId) {
		await orm(c).update(user).set({
			sendCount: sql`${user.sendCount}
	  +
	  ${quantity}`
		}).where(eq(user.userId, userId)).run();
	},

	async updateAllUserType(c, type, curType) {
		await orm(c)
			.update(user)
			.set({ type })
			.where(eq(user.type, curType))
			.run();
	},

	async add(c, params) {

		let { email, type, password } = params;

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notEmailDomain'));
		}

		if (password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}

		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		let role;
		if (type === undefined) {
			role = await roleService.selectDefaultRole(c);
			type = role?.roleId;
		} else {
			role = await roleService.selectById(c, type);
		}

		if (!role) {
			throw new BizError(t('roleNotExist'));
		}

		const { salt, hash } = await saltHashUtils.hashPassword(password);

		const userId = await userService.insert(c, { email, password: hash, salt, type });

		await userService.updateUserInfo(c, userId, true);

		await accountService.insert(c, { userId: userId, email, type, name: emailUtils.getName(email) });
	},

	async resetDaySendCount(c) {
		// 仅 UTC 0 点执行，便于配合每小时 cron
		if (new Date().getUTCHours() !== 0) {
			return;
		}
		const roleList = await roleService.selectByIdsAndSendType(c, 'email:send', roleConst.sendType.DAY);
		const roleIds = roleList.map(action => action.roleId);
		await orm(c).update(user).set({ sendCount: 0 }).where(inArray(user.type, roleIds)).run();
	},

	async resetSendCount(c, params) {
		await orm(c).update(user).set({ sendCount: 0 }).where(eq(user.userId, params.userId)).run();
	},

	async restore(c, params) {
		const { userId, type } = params
		await orm(c)
			.update(user)
			.set({ isDel: isDel.NORMAL })
			.where(eq(user.userId, userId))
			.run();
		const userRow = await this.selectById(c, userId);
		await accountService.restoreByEmail(c, userRow.email);

		if (type) {
			await emailService.restoreByUserId(c, userId);
			await accountService.restoreByUserId(c, userId);
		}

	},

	listByRegKeyId(c, regKeyId) {
		return orm(c)
			.select({email: user.email,createTime: user.createTime})
			.from(user)
			.where(eq(user.regKeyId, regKeyId))
			.orderBy(desc(user.userId))
			.all();
	}
};

export default userService;
