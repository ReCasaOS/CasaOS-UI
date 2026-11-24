// The address of the MCP endpoint an assistant is given.
const PATH = '/v2/mcp/server'

// What ends up in a command the owner pastes into a terminal: nothing the shell would read.
const UNSAFE = /[\s"'\x60$\\]/

// The box's own answer (`lan_url` of the module's status) when it is the endpoint over http or
// https, else null.
export function lanEndpoint(lanUrl) {
	if (typeof lanUrl === 'string' && !UNSAFE.test(lanUrl)) {
		try {
			const url = new URL(lanUrl)
			if ((url.protocol === 'http:' || url.protocol === 'https:') && url.pathname === PATH && !url.search && !url.hash) {
				return lanUrl
			}
		} catch {
			// not an address
		}
	}
	return null
}

// What the assistant is given: the box's own answer, else the address the dashboard is open at.
export function endpointUrl(lanUrl, origin) {
	return lanEndpoint(lanUrl) ?? `${origin}${PATH}`
}

// Whether a host name is obviously on a local network: a private or loopback IPv4 range, a local
// suffix, or a name with no dot. shortcut: IPv6 other than loopback is not recognised.
export function isLocalHost(hostname) {
	const host = String(hostname).toLowerCase().replace(/\.$/, '')
	const ip = host.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/)
	if (ip) {
		const [a, b] = [Number(ip[1]), Number(ip[2])]
		return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
	}
	return !host.includes('.') || /\.(?:local|lan|home|internal)$/.test(host)
}
