// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TerminalCard from './TerminalCard.vue'
import { FULLSCREEN_KEY, LOGIN_PORT_KEY, LOGIN_USER_KEY } from './terminalLogin'

vi.mock('xterm/css/xterm.css', () => ({}))
vi.mock('xterm', () => ({ Terminal: class {} }))
vi.mock('xterm-addon-fit', () => ({ FitAddon: class { fit() {} } }))
vi.mock('xterm-addon-attach', () => ({ AttachAddon: class { dispose() {} } }))

// xterm as far as the login sees it: what is typed comes through onData, what
// the page shows goes through write
function fakeTerminal() {
	const listeners = new Set()
	const term = {
		written: '',
		write: vi.fn((s) => { term.written += s }),
		reset: vi.fn(),
		onData: vi.fn((fn) => {
			listeners.add(fn)
			return { dispose: () => listeners.delete(fn) }
		}),
		type: (s) => { for (const fn of [...listeners]) fn(s) },
		listening: () => listeners.size,
	}
	return term
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function card({ checkSshLogin = vi.fn(() => Promise.resolve({ data: { success: 200 } })), initWsUrl = '' } = {}) {
	const vm = {
		...TerminalCard.data.call({}),
		initWsUrl,
		term: fakeTerminal(),
		$t: s => s,
		$messageBus: vi.fn(),
		$api: { sys: { checkSshLogin } },
		$store: { state: { access_token: 'jwt' } },
		$wsProtocol: 'ws:',
		$baseURL: 'box',
		initSocket: vi.fn(),
	}
	for (const name of ['promptLogin', 'onLoginInput', 'submitLine', 'checkLogin', 'endSession'])
		vm[name] = TerminalCard.methods[name].bind(vm)
	return vm
}

describe('the Terminal\'s console login', () => {
	beforeEach(() => localStorage.clear())

	it('prompts as a console, offering the last user', () => {
		localStorage.setItem(LOGIN_USER_KEY, 'vince')
		const vm = card()
		vm.promptLogin()
		expect(vm.term.written).toBe('\r\nrecasaos login (vince): ')
	})

	it('never writes the password to the terminal, and sends it once', async () => {
		const vm = card()
		vm.promptLogin()
		vm.term.type('root\r')
		expect(vm.term.written).toContain('root')
		expect(vm.term.written).toContain('Password: ')

		vm.term.type('s3cret-Pass\r')
		await flush()

		expect(vm.term.written).not.toContain('s3cret')
		expect(vm.$api.sys.checkSshLogin).toHaveBeenCalledWith(expect.objectContaining({ username: 'root', password: 's3cret-Pass', port: '22' }))
		expect(vm.sshPassword).toBe('')
		expect(vm.initSocket).toHaveBeenCalled()
		expect(vm.wsUrl).toContain('token=jwt')
		expect(localStorage.getItem(LOGIN_USER_KEY)).toBe('root')
	})

	it('takes user:port, and the port is kept for next time', async () => {
		const vm = card()
		vm.promptLogin()
		vm.term.type('vince:2222\rpw\r')
		await flush()
		expect(vm.$api.sys.checkSshLogin).toHaveBeenCalledWith(expect.objectContaining({ username: 'vince', password: 'pw', port: '2222' }))
		expect(localStorage.getItem(LOGIN_PORT_KEY)).toBe('2222')
	})

	// a paste of "user⏎password⏎", with \r\n or \n as the line ends
	it.each(['root\rpw\r', 'root\r\npw\r\n', 'root\npw\n'])('takes both lines of a paste: %j', async (paste) => {
		const vm = card()
		vm.promptLogin()
		vm.term.type(paste)
		await flush()
		expect(vm.$api.sys.checkSshLogin).toHaveBeenCalledWith(expect.objectContaining({ username: 'root', password: 'pw', port: '22' }))
		expect(vm.term.written).not.toContain('pw')
	})

	it('erases with backspace, on screen for the user and silently for the password', async () => {
		const vm = card()
		vm.promptLogin()
		vm.term.type('roox\u007Ft\r')
		expect(vm.term.written).toContain('\b \b')
		vm.term.type('pas\u007Fss\r')
		await flush()
		expect(vm.$api.sys.checkSshLogin).toHaveBeenCalledWith(expect.objectContaining({ username: 'root', password: 'pass' }))
		expect(vm.term.written.match(/\b \b/g)).toHaveLength(1)
	})

	it('starts over on Ctrl+C', () => {
		const vm = card()
		vm.promptLogin()
		vm.term.type('roo\u0003')
		expect(vm.term.written).toMatch(/\^C\r\nrecasaos login: $/)
		expect(vm.step).toBe('user')
		expect(vm.line).toBe('')
		expect(vm.term.listening()).toBe(1)
	})

	it('prompts again on a refused login, and forgets the password', async () => {
		const vm = card({ checkSshLogin: vi.fn(() => Promise.reject(Object.assign(new Error('x'), { response: { data: { data: 'auth failed' } } }))) })
		vm.promptLogin()
		vm.term.type('root\rwrong\r')
		await flush()
		expect(vm.term.written).toContain('Login incorrect (auth failed)')
		expect(vm.term.written.endsWith('recasaos login: ')).toBe(true)
		expect(vm.sshPassword).toBe('')
		expect(vm.initSocket).not.toHaveBeenCalled()
		expect(localStorage.getItem(LOGIN_USER_KEY)).toBeNull()
		expect(vm.term.listening()).toBe(1)
	})

	it('brings the prompt back on logout, on a terminal reset first', () => {
		const vm = card()
		vm.isVaild = true
		vm.socket = { close: vi.fn() }
		vm.endSession()
		expect(vm.socket).toBeNull()
		expect(vm.isVaild).toBe(false)
		expect(vm.term.reset).toHaveBeenCalled()
		expect(vm.term.reset.mock.invocationCallOrder[0]).toBeLessThan(vm.term.write.mock.invocationCallOrder.at(-1))
		expect(vm.term.written.endsWith('recasaos login: ')).toBe(true)
	})

	// an app's terminal (initWsUrl) is a session of its own: no login prompt, ever
	it('never shows the prompt for an app\'s terminal', () => {
		const vm = card({ initWsUrl: 'ws://box/v1/container/x/terminal' })
		vm.isVaild = true
		vm.socket = { close: vi.fn() }
		vm.endSession()
		expect(vm.term.written).toBe('')
		expect(vm.term.reset).not.toHaveBeenCalled()
	})
})

describe('the Terminal closing', () => {
	it('does not bring the login back on the disposed terminal', () => {
		const cameBack = () => {
			throw new Error('the login came back')
		}
		const socket = { close: vi.fn(), onclose: cameBack }
		const term = { dispose: vi.fn() }
		const inputHandler = { dispose: vi.fn() }
		const vm = { isVaild: true, socket, term, inputHandler, startTimer: 0, onWindowResize: () => {} }

		TerminalCard.beforeUnmount.call(vm)

		expect(socket.onclose).toBeNull()
		expect(vm.isVaild).toBe(false)
		expect(socket.close).toHaveBeenCalled()
		expect(inputHandler.dispose).toHaveBeenCalled()
		expect(term.dispose).toHaveBeenCalled()
	})
})

// vue-fullscreen acts on a change of `fullscreen`, not on its first value: the
// card starts in the window and goes full screen once the terminal exists
describe('the Terminal opening full screen', () => {
	it('starts in the window and switches after the terminal is made', async () => {
		localStorage.setItem(FULLSCREEN_KEY, 'true')
		vi.useFakeTimers()
		const created = []
		const vm = {
			...TerminalCard.data.call({}),
			initWsUrl: '',
			createTerm: vi.fn(() => created.push(vm.fullscreen)),
			promptLogin: vi.fn(),
		}
		expect(vm.fullscreen).toBe(false)
		globalThis.document.body.innerHTML = '<div id="terminal"></div>'

		TerminalCard.mounted.call(vm)
		vi.advanceTimersByTime(400)

		expect(created).toEqual([false])
		expect(vm.fullscreen).toBe(true)
		vi.useRealTimers()
		localStorage.clear()
	})
})
