// The tokens of the optional MCP module (/v2/mcp): the module's routes are the administrator's.
// Called through the axios instance with the explicit path, like vulnScan.js; the module answers
// plain JSON, not the core's { data } envelope, so an answer is read as res.data.
const PREFIX = '/v2/mcp'

// loaded when a call runs: the service client brings the router and the store with it, and the app grid imports this file's entry
const client = () => import('@/service/service.js').then(m => m.instance)

export const mcpApi = {
	status: async opts => (await client()).get(`${PREFIX}/status`, ...(opts ? [opts] : [])),
	tokens: async () => (await client()).get(`${PREFIX}/tokens`),
	// the answer carries the token itself, which is never returned again
	create: async (name, level) => (await client()).post(`${PREFIX}/tokens`, { name, level }),
	revoke: async id => (await client()).delete(`${PREFIX}/tokens/${encodeURIComponent(id)}`),
}
