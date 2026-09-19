import KvConst from '../const/kv-const';
import setting from '../entity/setting';
import orm from '../entity/orm';
import {verifyRecordType} from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import {t} from '../i18n/i18n'
import verifyRecordService from './verify-record-service';
import userContext from '../security/user-context';
import domainUtils from '../utils/domain-uitls';
import siteMessageService from './site-message-service';
import { isDel } from '../const/entity-const';
import user from '../entity/user';
import { eq } from 'drizzle-orm';

const settingService = {

	async refresh(c) {
		const settingRow = await orm(c).select().from(setting).get();
		settingRow.resendTokens = JSON.parse(settingRow.resendTokens);
		c.set('setting', settingRow);
		await c.env.kv.put(KvConst.SETTING, JSON.stringify(settingRow));
	},

	async query(c) {

		if (c.get?.('setting')) {
			return c.get('setting')
		}

		const setting = await c.env.kv.get(KvConst.SETTING, { type: 'json' });

		if (!setting) {
			throw new BizError('数据库未初始化 Database not initialized.');
		}

		let domainList = c.env.domain;

		if (typeof domainList === 'string') {
			try {
				domainList = JSON.parse(domainList)
			} catch (error) {
				throw new BizError(t('notJsonDomain'));
			}
		}

		if (!c.env.domain) {
			throw new BizError(t('noDomainVariable'));
		}

		domainList = domainList.map(item => '@' + item);
		setting.domainList = domainList;

		let projectLink = c.env.project_link;
		if (typeof projectLink === 'string' && projectLink === 'false') {
			projectLink = false
		} else if (projectLink === false) {
			projectLink = false
		} else {
			projectLink = true
		}

		setting.projectLink = projectLink;

		setting.emailPrefixFilter = setting.emailPrefixFilter.split(",").filter(Boolean);

		c.set?.('setting', setting);
		return setting;
	},

	async get(c, showSiteKey = false) {

		const [settingRow, recordList] = await Promise.all([
			await this.query(c),
			verifyRecordService.selectListByIP(c)
		]);


		if (!showSiteKey) {
			settingRow.siteKey = settingRow.siteKey ? `${settingRow.siteKey.slice(0, 6)}******` : null;
		}

		settingRow.secretKey = settingRow.secretKey ? `${settingRow.secretKey.slice(0, 6)}******` : null;

		Object.keys(settingRow.resendTokens).forEach(key => {
			settingRow.resendTokens[key] = `${settingRow.resendTokens[key].slice(0, 12)}******`;
		});

		settingRow.s3AccessKey = settingRow.s3AccessKey ? `${settingRow.s3AccessKey.slice(0, 12)}******` : null;
		settingRow.s3SecretKey = settingRow.s3SecretKey ? `${settingRow.s3SecretKey.slice(0, 12)}******` : null;
		settingRow.tgBotToken = settingRow.tgBotToken ? `${settingRow.tgBotToken.slice(0, 20)}******` : null;
		settingRow.hasR2 = !!c.env.r2
		settingRow.hasCfEmail = !!c.env.email

		let regVerifyOpen = false
		let addVerifyOpen = false

		recordList.forEach(row => {
			if (row.type === verifyRecordType.REG) {
				regVerifyOpen = row.count >= settingRow.regVerifyCount
			}
			if (row.type === verifyRecordType.ADD) {
				addVerifyOpen = row.count >= settingRow.addVerifyCount
			}
		})

		settingRow.regVerifyOpen = regVerifyOpen
		settingRow.addVerifyOpen = addVerifyOpen

		settingRow.storageType = await r2Service.storageType(c);

		return settingRow;
	},

	async set(c, params) {
		const settingData = await this.query(c);
		let resendTokens = { ...settingData.resendTokens, ...params.resendTokens };
		Object.keys(resendTokens).forEach(domain => {
			if (!resendTokens[domain]) delete resendTokens[domain];
		});

		if (Array.isArray(params.emailPrefixFilter)) {
			params.emailPrefixFilter = params.emailPrefixFilter + '';
		}

		if (Array.isArray(params.aiCodeFilter)) {
			params.aiCodeFilter = params.aiCodeFilter + '';
		}

		if (params.webhookUrl !== undefined) {
			params.webhookUrl = domainUtils.toOssDomain(params.webhookUrl) || '';
		}

		if (params.homeHeroDesc !== undefined) {
			params.homeHeroDesc = String(params.homeHeroDesc || '').slice(0, 500);
		}

		params.resendTokens = JSON.stringify(resendTokens);

		await orm(c).update(setting).set({ ...params }).returning().get();
		await this.refresh(c);
	},

	async deleteBackground(c) {

		const { background } = await this.query(c);
		if (!background) return

		if (background.startsWith('http')) {
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
			return;
		}

		if (background) {
			await r2Service.delete(c,background)
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
		}
	},

	async setBackground(c, params) {

		let { background } = params

		await this.deleteBackground(c);

		if (background && !background.startsWith('http')) {

			const file = fileUtils.base64ToFile(background)

			const arrayBuffer = await file.arrayBuffer();
			background = constant.BACKGROUND_PREFIX + await fileUtils.getBuffHash(arrayBuffer) + fileUtils.getExtFileName(file.name);


			await r2Service.putObj(c, background, arrayBuffer, {
				contentType: file.type,
				cacheControl: `public, max-age=31536000, immutable`,
				contentDisposition: `inline; filename="${file.name}"`
			});

		}

		await orm(c).update(setting).set({ background }).run();
		await this.refresh(c);
		return background;
	},


	async setBlacklist(c, params) {
		const { blackSubject, blackContent, blackFrom  } = params
		await orm(c).update(setting).set({ blackSubject, blackContent, blackFrom }).run();
		await this.refresh(c);
		return this.get(c);
	},

	/**
	 * 管理员发布全站公告：保存 notice 配置 + 版本号 +1 + 站内信广播
	 */
	async publishNotice(c, params = {}) {
		const current = await this.query(c);

		const data = {
			// 全站公告字段（与登录弹窗 notice_* 分离）
			announceTitle: typeof params.announceTitle === 'string' && params.announceTitle.trim()
				? params.announceTitle
				: (typeof params.noticeTitle === 'string' && params.noticeTitle.trim() ? params.noticeTitle : (current.announceTitle || '')),
			announceContent: typeof params.announceContent === 'string' && params.announceContent.trim()
				? params.announceContent
				: (typeof params.noticeContent === 'string' && params.noticeContent.trim() ? params.noticeContent : (current.announceContent || '')),
			announceType: typeof params.announceType === 'string' && params.announceType
				? params.announceType
				: (typeof params.noticeType === 'string' ? params.noticeType : (current.announceType || 'none')),
			announceVersion: (Number(current.announceVersion) || 0) + 1,
			// 展示参数：公告弹层可沿用 notice 的位置/时长配置
			noticeDuration: Number.isFinite(Number(params.noticeDuration)) ? Number(params.noticeDuration) : (current.noticeDuration || 0),
			noticePosition: typeof params.noticePosition === 'string' && params.noticePosition ? params.noticePosition : (current.noticePosition || 'top-right'),
			noticeOffset: Number.isFinite(Number(params.noticeOffset)) ? Number(params.noticeOffset) : (current.noticeOffset || 0),
			noticeWidth: Number.isFinite(Number(params.noticeWidth)) ? Number(params.noticeWidth) : (current.noticeWidth || 400)
		};

		if (!String(data.announceTitle || '').trim() && !String(data.announceContent || '').trim()) {
			throw new BizError('公告标题或内容不能为空');
		}

		const noticeVersion = data.announceVersion;
		const noticeTitle = data.announceTitle;
		const noticeContent = data.announceContent;

		await orm(c).update(setting).set(data).run();
		await this.refresh(c);

		const plainTitle = String(data.announceTitle || '全站公告').replace(/<[^>]+>/g, ' ').trim();
		const plainContent = String(data.announceContent || '')
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 400);
		const msg = plainContent ? `【${plainTitle}】${plainContent}` : `【${plainTitle}】`;

		const userRows = await orm(c).select({ userId: user.userId })
			.from(user)
			.where(eq(user.isDel, isDel.NORMAL))
			.all();

		let sent = 0;
		for (const row of userRows) {
			try {
				await siteMessageService.notifyUser(c, row.userId, msg, 'announcement');
				sent += 1;
			} catch (e) {
				console.error('announce send fail', row.userId, e?.message);
			}
		}

		return {
			noticeVersion,
			announceVersion: data.announceVersion,
			announceTitle: data.announceTitle,
			announceContent: data.announceContent,
			announceType: data.announceType,
			userCount: userRows.length,
			messageSent: sent,
			...data
		};
	},

	async websiteConfig(c) {

		const settingRow = await this.get(c, true);
		const token = await userContext.getToken(c);

		return {
			register: settingRow.register,
			title: settingRow.title,
			manyEmail: settingRow.manyEmail,
			addEmail: settingRow.addEmail,
			autoRefresh: settingRow.autoRefresh,
			addEmailVerify: settingRow.addEmailVerify,
			registerVerify: settingRow.registerVerify,
			send: settingRow.send,
			r2Domain: settingRow.r2Domain,
			siteKey: settingRow.siteKey,
			background: settingRow.background,
			loginOpacity: settingRow.loginOpacity,
			uiMotion: settingRow.uiMotion ?? 0,
			domainList: settingRow.loginDomain === 1 && !token ? [] : settingRow.domainList,
			regKey: settingRow.regKey,
			regVerifyOpen: settingRow.regVerifyOpen,
			addVerifyOpen: settingRow.addVerifyOpen,
			noticeTitle: settingRow.noticeTitle,
			noticeContent: settingRow.noticeContent,
			noticeType: settingRow.noticeType,
			noticeDuration: settingRow.noticeDuration,
			noticePosition: settingRow.noticePosition,
			noticeWidth: settingRow.noticeWidth,
			noticeOffset: settingRow.noticeOffset,
			notice: settingRow.notice,
			noticeVersion: settingRow.noticeVersion ?? 0,
			announceTitle: settingRow.announceTitle || '',
			announceContent: settingRow.announceContent || '',
			announceType: settingRow.announceType || 'none',
			announceVersion: settingRow.announceVersion ?? 0,
			homeHeroDesc: settingRow.homeHeroDesc || '',
			loginDomain: settingRow.loginDomain,
			linuxdoClientId: settingRow.linuxdoClientId,
			linuxdoSwitch: settingRow.linuxdoSwitch,
			githubClientId: settingRow.githubClientId,
			githubSwitch: settingRow.githubSwitch,
			googleClientId: settingRow.googleClientId,
			googleSwitch: settingRow.googleSwitch,
			minEmailPrefix: settingRow.minEmailPrefix,
			projectLink: settingRow.projectLink
		};
	},

};

export default settingService;
