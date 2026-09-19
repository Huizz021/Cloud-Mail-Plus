import PostalMime from 'postal-mime';
import emailService from '../service/email-service';
import accountService from '../service/account-service';
import settingService from '../service/setting-service';
import attService from '../service/att-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { emailConst, isDel, settingConst } from '../const/entity-const';
import emailUtils from '../utils/email-utils';
import roleService from '../service/role-service';
import userService from '../service/user-service';
import telegramService from '../service/telegram-service';
import aiService from '../service/ai-service';
import webhookService from '../service/webhook-service';
import siteMessageService from '../service/site-message-service';
import orm from '../entity/orm';
import user from '../entity/user';
import { eq } from 'drizzle-orm';

function splitList(value) {
	if (!value) return [];
	if (Array.isArray(value)) {
		return value.map(item => String(item).trim()).filter(Boolean);
	}
	return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function resolvePushTargets(userRow, sys, toEmail, isAdmin = false) {
	const userForwardOpen = userRow?.forwardStatus === settingConst.forwardStatus.OPEN
		&& userRow?.forwardApply === settingConst.forwardApply.APPROVED;
	const userTgOpen = userRow?.tgBotStatus === settingConst.tgBotStatus.OPEN;
	const userWebhookOpen = userRow?.webhookStatus === settingConst.webhookStatus.OPEN;

	const userForwardEmails = userForwardOpen ? splitList(userRow?.forwardEmail) : [];
	const userTgChatIds = userTgOpen ? splitList(userRow?.tgChatId) : [];
	const userWebhookUrl = userWebhookOpen ? (userRow?.webhookUrl || '') : '';

	// 系统规则只作用于系统级 TG/Webhook/管理员邮件监控
	const sysRulePass = sys.ruleType !== settingConst.ruleType.RULE
		|| splitList(sys.ruleEmail).includes(toEmail || '');

	// 邮件转发完全用户化；系统 forward_email 仅管理员收信监控时兜底
	let forwardEmails = userForwardEmails;
	if (!forwardEmails.length) {
		forwardEmails = (isAdmin && sys.forwardStatus === settingConst.forwardStatus.OPEN && sysRulePass)
			? splitList(sys.forwardEmail)
			: [];
	}

	// TG / Webhook：用户优先，未配置时仍可用系统配置作运维监控
	let tgChatIds = userTgChatIds;
	if (!tgChatIds.length) {
		tgChatIds = (sys.tgBotStatus === settingConst.tgBotStatus.OPEN && sysRulePass)
			? splitList(sys.tgChatId)
			: [];
	}

	let webhook = null;
	if (userWebhookUrl) {
		webhook = {
			url: userWebhookUrl,
			retry: userRow?.webhookRetry ?? 0,
			secret: userRow?.webhookSecret || ''
		};
	} else if (sys.webhookStatus === settingConst.webhookStatus.OPEN && sys.webhookUrl && sysRulePass) {
		webhook = {
			url: sys.webhookUrl,
			retry: sys.webhookRetry ?? 0,
			secret: sys.webhookSecret || ''
		};
	}

	return { forwardEmails, tgChatIds, webhook };
}

export async function email(message, env, ctx) {

	try {

		const {
			receive,
			tgChatId,
			tgBotStatus,
			forwardStatus,
			forwardEmail,
			webhookStatus,
			webhookUrl,
			webhookRetry,
			webhookSecret,
			ruleEmail,
			ruleType,
			r2Domain,
			noRecipient,
			blackSubject,
			blackContent,
			blackFrom,
			aiCode,
			aiCodeFilter
		} = await settingService.query({ env });

		const sysPush = {
			tgChatId,
			tgBotStatus,
			forwardStatus,
			forwardEmail,
			webhookStatus,
			webhookUrl,
			webhookRetry,
			webhookSecret,
			ruleEmail,
			ruleType
		};

		if (receive === settingConst.receive.CLOSE) {
			message.setReject('Service suspended');
			return;
		}

		const reader = message.raw.getReader();
		let content = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			content += new TextDecoder().decode(value);
		}

		const email = await PostalMime.parse(content);


		const blockFlag = checkBlock(blackSubject, blackContent, blackFrom, email);

		if (blockFlag) {
			message.setReject('Message rejected');
			return;
		}

		let account = await accountService.selectByEmailIncludeDel({ env: env }, message.to);

		if (!account) {
			const baseEmail = emailUtils.getBaseEmail(message.to);
			if (baseEmail && baseEmail !== message.to) {
				account = await accountService.selectByEmailIncludeDel({ env: env }, baseEmail);
			}
		}

		if (!account && noRecipient === settingConst.noRecipient.CLOSE) {
			message.setReject('Recipient not found');
			return;
		}

		let userRow = {}

		if (account) {
			 userRow = await userService.selectByIdIncludeDel({ env: env }, account.userId);
		}

		if (account && userRow.email !== env.admin) {

			let { banEmail, availDomain } = await roleService.selectByUserId({ env: env }, account.userId);

			if (!roleService.hasAvailDomainPerm(availDomain, message.to)) {
				message.setReject('The recipient is not authorized to use this domain.');
				return;
			}

			if(roleService.isBanEmail(banEmail, email.from.address)) {
				message.setReject('The recipient is disabled from receiving emails.');
				return;
			}

		}


		if (!email.to) {
			email.to = [{ address: message.to, name: emailUtils.getName(message.to)}]
		}

		const toName = email.to.find(item => item.address === message.to)?.name || '';
		const code = await aiService.extractCode({ env }, email, { aiCode, aiCodeFilter });

		const params = {
			toEmail: message.to,
			toName: toName,
			sendEmail: email.from.address,
			name: email.from.name || emailUtils.getName(email.from.address),
			subject: email.subject,
			code,
			content: email.html,
			text: email.text,
			cc: email.cc ? JSON.stringify(email.cc) : '[]',
			bcc: email.bcc ? JSON.stringify(email.bcc) : '[]',
			recipient: JSON.stringify(email.to),
			inReplyTo: email.inReplyTo,
			relation: email.references,
			messageId: email.messageId,
			userId: account ? account.userId : 0,
			accountId: account ? account.accountId : 0,
			isDel: isDel.DELETE,
			status: emailConst.status.SAVING
		};

		const attachments = [];
		const cidAttachments = [];

		for (let item of email.attachments) {
			let attachment = { ...item };
			attachment.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(attachment.content) + fileUtils.getExtFileName(item.filename);
			attachment.size = item.content.length ?? item.content.byteLength;
			attachments.push(attachment);
			if (attachment.contentId) {
				cidAttachments.push(attachment);
			}
		}

		let emailRow = await emailService.receive({ env }, params, cidAttachments, r2Domain);

		attachments.forEach(attachment => {
			attachment.emailId = emailRow.emailId;
			attachment.userId = emailRow.userId;
			attachment.accountId = emailRow.accountId;
		});

		try {
			if (attachments.length > 0) {
				await attService.addAtt({ env }, attachments);
			}
		} catch (e) {
			console.error(e);
		}

		emailRow = await emailService.completeReceive({ env }, account ? emailConst.status.RECEIVE : emailConst.status.NOONE, emailRow.emailId);


		const pushUser = userRow && userRow.userId ? userRow : {};
		const isAdminUser = !!(account && userRow && userRow.email && userRow.email === env.admin);
		const { forwardEmails, tgChatIds, webhook } = resolvePushTargets(pushUser, sysPush, message.to, isAdminUser);

		//转发到TG
		if (tgChatIds.length) {
			await telegramService.sendEmailToBot({ env }, emailRow, tgChatIds)
		}

		//转发到其他邮箱
		if (forwardEmails.length) {
			const failList = [];
			await Promise.all(forwardEmails.map(async email => {

				try {
					await message.forward(email);
				} catch (e) {
					console.error(`转发邮箱 ${email} 失败：`, e);
					failList.push({ email, error: e?.message || String(e) });
				}

			}));

			if (failList.length && account?.userId) {
				try {
					const now = new Date().toISOString();
					const errText = failList.map(item => `${item.email}: ${item.error}`).join('; ').slice(0, 500);
					await orm({ env }).update(user).set({
						forwardError: errText,
						forwardErrorTime: now
					}).where(eq(user.userId, account.userId)).run();

					const tip = `邮件转发失败（${message.to}）→ ${failList.map(i => i.email).join(', ')}。请检查目标邮箱是否已在 Cloudflare 验证。`;
					await siteMessageService.notifyUser({ env }, account.userId, tip, 'forward_fail');
					await siteMessageService.notifyAdmin({ env }, `用户邮件转发失败：${tip}`, 'forward_fail');
				} catch (notifyErr) {
					console.error('forward fail notify error', notifyErr);
				}
			}
		}

		//转发到 Webhook
		if (webhook?.url) {
			await webhookService.sendEmail({ env }, emailRow, webhook.url, webhook.retry, webhook.secret);
		}

	} catch (e) {
		console.error('邮件接收异常: ', e);
		throw e
	}
}

function checkBlock(blackSubjectStr, blackContentStr, blackFromStr, email) {

	const blackFromList = blackFromStr ? blackFromStr.split(',') : []
	const blackContentList = blackContentStr ? blackContentStr.split(',') : []
	const blackSubjectList = blackSubjectStr ? blackSubjectStr.split(',') : []

	for (const blackSubject of blackSubjectList) {
		if (email.subject?.includes(blackSubject)) {
			return true
		}
	}

	for (const blackContent of blackContentList) {
		if (email.html?.includes(blackContent) || email.text?.includes(blackContent)) {
			return true
		}
	}

	for (const blackFrom of blackFromList) {
		if (email.from.address === blackFrom || emailUtils.getDomain(email.from.address) === blackFrom) {
			return true
		}
	}

	return false

}
