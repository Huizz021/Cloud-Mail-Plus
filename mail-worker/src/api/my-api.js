import app from '../hono/hono';
import userService from '../service/user-service';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/my/loginUserInfo', async (c) => {
	const user = await userService.loginUserInfo(c, userContext.getUserId(c));
	return c.json(result.ok(user));
});

app.put('/my/resetPassword', async (c) => {
	await userService.resetPassword(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.delete('/my/delete', async (c) => {
	await userService.delete(c, userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/my/forward', async (c) => {
	const forward = await userService.getForward(c, userContext.getUserId(c));
	return c.json(result.ok(forward));
});

app.put('/my/forward', async (c) => {
	const forward = await userService.setForward(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(forward));
});


