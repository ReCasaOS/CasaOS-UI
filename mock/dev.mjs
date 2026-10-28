import { spawn } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const STUB_PORT = 8099
const WAIT_MS = 5000
const READY = 'stats stub on'

function waitForStub(child, deadline) {
	return new Promise((resolve, reject) => {
		const fail = () => {
			reject(new Error('stats stub did not answer on 127.0.0.1:8099'))
		}
		if (child.exitCode !== null || child.signalCode !== null) {
			fail()
			return
		}
		const timer = setTimeout(() => {
			child.off('exit', onExit)
			fail()
		}, Math.max(0, deadline - Date.now()))
		function onExit() {
			clearTimeout(timer)
			fail()
		}
		child.once('exit', onExit)
		let buf = ''
		child.stdout.on('data', (chunk) => {
			process.stdout.write(chunk)
			buf += chunk
			if (buf.includes(READY)) {
				clearTimeout(timer)
				child.off('exit', onExit)
				resolve()
			}
		})
	})
}

function kill(child) {
	if (!child || child.exitCode !== null || child.signalCode !== null) {
		return
	}
	try {
		process.kill(-child.pid, 'SIGTERM')
	} catch {
		child.kill('SIGTERM')
	}
}

const stub = spawn(process.execPath, ['mock/stats-stub/server.mjs', '--port', String(STUB_PORT)], {
	cwd: root,
	stdio: ['ignore', 'pipe', 'inherit'],
	detached: true,
})

try {
	await waitForStub(stub, Date.now() + WAIT_MS)
} catch (error) {
	kill(stub)
	console.error(error.message)
	process.exit(1)
}

const vue = spawn('pnpm', ['exec', 'vue-cli-service', 'serve', '--mode', 'mock'], {
	cwd: root,
	stdio: 'inherit',
	detached: true,
})

let stopping = false
function stop(code) {
	if (stopping) {
		return
	}
	stopping = true
	kill(vue)
	kill(stub)
	process.exit(code)
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
vue.on('exit', (code, signal) => {
	if (stopping) {
		return
	}
	kill(stub)
	process.exit(code ?? (signal ? 1 : 0))
})
stub.on('exit', () => {
	if (stopping) {
		return
	}
	kill(vue)
	process.exit(1)
})
