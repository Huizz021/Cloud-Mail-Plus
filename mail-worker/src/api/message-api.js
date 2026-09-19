import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import siteMessageService from '../service/site-message-service';
import settingService from '../service/setting-service';

app.get('/message/list', async (c) => {
	const data = await siteMessageService.list(c, userContext.getUserId(c), c.req.query());
	return c.json(result.ok(data));
});

app.get('/message/unreadCount', async (c) => {
	const data = await siteMessageService.unreadCount(c, userContext.getUserId(c));
	// 附带最新全站公告，便于前端在线时弹窗
	try {
		const s = await settingService.query(c);
		data.announceVersion = s.announceVersion ?? 0;
		data.announceTitle = s.announceTitle || '';
		data.announceContent = s.announceContent || '';
		data.announceType = s.announceType || 'none';
	} catch (e) {
		data.announceVersion = 0;
	}
	return c.json(result.ok(data));
});

app.get('/message/contacts', async (c) => {
	const data = await siteMessageService.contacts(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/message/conversations', async (c) => {
	const data = await siteMessageService.conversations(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/message/send', async (c) => {
	const data = await siteMessageService.send(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(data));
});

app.put('/message/read', async (c) => {
	await siteMessageService.markRead(c, userContext.getUserId(c), await c.req.json());
	return c.json(result.ok());
});

app.delete('/message/conversation', async (c) => {
	const peerUserId = c.req.query('userId') || (await c.req.json().catch(() => ({})))?.userId;
	await siteMessageService.deleteConversation(c, userContext.getUserId(c), peerUserId);
	return c.json(result.ok());
});
