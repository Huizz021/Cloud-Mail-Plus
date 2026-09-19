/**
 * Cloudflare Email Routing Destination 验证状态查询
 * 需要环境变量：
 * - cf_api_token: Cloudflare API Token（Zone.Email Routing:Read）
 * - cf_zone_id: 域名所在 Zone ID
 * 未配置时返回 configured=false，前端引导手动验证。
 */
const cfVerifyService = {

	isConfigured(env) {
		return !!(env?.cf_api_token && env?.cf_zone_id);
	},

	/**
	 * 查询目标邮箱在 CF 是否已验证
	 * @returns {Promise<{configured:boolean, map:Record<string,string>, error?:string}>}
	 * map[address] = 'verified' | 'pending' | 'unknown'
	 */
	async checkAddresses(env, addresses = []) {
		const map = {};
		if (!this.isConfigured(env)) {
			return { configured: false, map };
		}

		try {
			const res = await fetch(
				`https://api.cloudflare.com/client/v4/zones/${env.cf_zone_id}/email/routing/addresses`,
				{
					headers: {
						Authorization: `Bearer ${env.cf_api_token}`,
						'Content-Type': 'application/json'
					}
				}
			);
			const body = await res.json();
			if (!res.ok || body?.success === false) {
				const msg = body?.errors?.[0]?.message || `HTTP ${res.status}`;
				return { configured: true, map, error: msg };
			}

			const rows = body?.result || [];
			const byEmail = {};
			rows.forEach(row => {
				const email = String(row?.email || '').toLowerCase();
				byEmail[email] = row?.verified ? 'verified' : 'pending';
			});

			(addresses || []).forEach(addr => {
				const key = String(addr || '').trim().toLowerCase();
				if (!key) return;
				map[key] = byEmail[key] || 'unknown';
			});

			return { configured: true, map };
		} catch (e) {
			return { configured: true, map, error: e?.message || 'CF API request failed' };
		}
	},

	/**
	 * 把用户 forward_email（逗号分隔）展开后查询
	 */
	async checkForwardEmails(env, forwardEmail) {
		const addresses = String(forwardEmail || '')
			.split(',')
			.map(item => item.trim())
			.filter(Boolean);
		if (!addresses.length) {
			return { configured: this.isConfigured(env), map: {}, addresses: [] };
		}
		const result = await this.checkAddresses(env, addresses);
		return { ...result, addresses };
	}
};

export default cfVerifyService;
