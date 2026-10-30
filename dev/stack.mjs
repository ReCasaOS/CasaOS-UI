import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const casaos = fileURLToPath(new URL('../../CasaOS', import.meta.url))
const stackSh = fileURLToPath(new URL('../../CasaOS/dev/stack.sh', import.meta.url))
const WAIT_MS = 300000
const READY = 'stack on 127.0.0.1:8081'

if (!existsSync(stackSh)) {
	console.error('clone CasaOS next to this repository and run ./dev/stack.sh from there, or keep this checkout beside it')
	process.exit(1)
}

function waitForStack(child, deadline) {
	return new Promise((resolve, reject) => {
		const fail = () => {
			reject(new Error('stack did not become ready on 127.0.0.1:8081'))
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

const stack = spawn('bash', [stackSh], {
	cwd: casaos,
	stdio: ['ignore', 'pipe', 'inherit'],
	detached: true,
})

try {
	await waitForStack(stack, Date.now() + WAIT_MS)
} catch (error) {
	kill(stack)
	console.error(error.message)
	process.exit(1)
}

const vue = spawn('pnpm', ['exec', 'vue-cli-service', 'serve', '--mode', 'stack'], {
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
	kill(stack)
	process.exit(code)
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
vue.on('exit', (code, signal) => {
	if (stopping) {
		return
	}
	kill(stack)
	process.exit(code ?? (signal ? 1 : 0))
})
stack.on('exit', () => {
	if (stopping) {
		return
	}
	kill(vue)
	process.exit(1)
})
