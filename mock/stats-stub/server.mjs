// A server for the stub of the statistics contract. No dependency.
//
//   node mock/stats-stub/server.mjs --port 8099 [--envelope real|bare] [--upstream 10.0.0.97:80]
//
// Answers /v1/sys/stats, /v2/app_management/stats and /v2/virt_management/stats from handlers.js, with series that end
// at the current time (a live chart moves). With --upstream, every other request (and the WebSocket upgrade of the
// message bus) goes to that box. Without it, grid.js answers what the home page asks of a box (the virtual machine
// module, the app grid, the shell's core calls), and every other path answers 404.
//
//   GET /__stub/alerts?on=1   puts 2 active alerts on one container (on=0 takes them off)
import { Buffer } from 'node:buffer'
import { createServer, request } from 'node:http'
import { connect } from 'node:net'
import process from 'node:process'
import { handleGrid, newGridState } from './grid.js'
import { handle } from './handlers.js'

const args = process.argv.slice(2)
function option(name, fallback) {
	const at = args.indexOf(`--${name}`)
	return at >= 0 && args[at + 1] ? args[at + 1] : fallback
}

const port = Number(option('port', '8099'))
const envelope = option('envelope', 'real')
const upstream = option('upstream', '')
if (!['real', 'bare'].includes(envelope) || !Number.isInteger(port)) {
	console.error('usage: node server.mjs [--port 8099] [--envelope real|bare] [--upstream host:port]')
	process.exit(2)
}
const [upstreamHost, upstreamPort = '80'] = upstream.split(':')

const options = { envelope, alerts: false, down: [], rules: new Map() }
const grid = newGridState()
const STATS = /^\/v[12]\/(?:sys|app_management|virt_management)\/stats(?:\/|$)/

function send(res, status, body) {
	res.writeHead(status, { 'Content-Type': 'application/json' })
	res.end(JSON.stringify(body))
}

function proxy(req, res) {
	const forward = request({ host: upstreamHost, port: upstreamPort, path: req.url, method: req.method, headers: req.headers }, (answer) => {
		res.writeHead(answer.statusCode, answer.headers)
		answer.pipe(res)
	})
	forward.on('error', () => send(res, 502, { message: 'upstream_unreachable' }))
	req.pipe(forward)
}

const server = createServer((req, res) => {
	const url = new URL(req.url, 'http://stub.local')
	if (url.pathname === '/__stub/alerts') {
		options.alerts = url.searchParams.get('on') === '1'
		return send(res, 200, { alerts: options.alerts })
	}
	const stats = STATS.test(url.pathname)
	if (!stats && upstream) {
		return proxy(req, res)
	}
	const chunks = []
	req.on('data', chunk => chunks.push(chunk))
	req.on('end', () => {
		let body = null
		try {
			body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null
		} catch {
			return send(res, 400, { message: 'bad_rules: rules' })
		}
		const request = { method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body }
		const { status, body: answer } = stats ? handle(request, options) : (handleGrid(request, grid) || { status: 404, body: { message: 'not_found' } })
		send(res, status, answer)
	})
})

// the WebSocket of the message bus: a plain tunnel to the upstream box
server.on('upgrade', (req, socket, head) => {
	if (!upstream) {
		socket.destroy()
		return
	}
	const tunnel = connect(Number(upstreamPort), upstreamHost, () => {
		const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
		for (let i = 0; i < req.rawHeaders.length; i += 2) {
			lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
		}
		tunnel.write(`${lines.join('\r\n')}\r\n\r\n`)
		tunnel.write(head)
		socket.pipe(tunnel).pipe(socket)
	})
	tunnel.on('error', () => socket.destroy())
	socket.on('error', () => tunnel.destroy())
})

server.listen(port, () => {
	console.log(`stats stub on http://127.0.0.1:${port} (envelope ${envelope}${upstream ? `, upstream ${upstream}` : ', no upstream'})`)
})
