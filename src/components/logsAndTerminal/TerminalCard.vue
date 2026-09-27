<template>
	<fullscreen v-model:fullscreen="fullscreen" :class="{ 'mt-4': !fullscreen }" :page-only="true" :teleport="true"
		class="fullScreen fdark-bg pl-2 pt-2 pb-2" @change="onWindowResize">
		<a class="fullscreen-button" @click="toggleFullScreen">
			<b-icon :icon="buttonIcon"></b-icon>
		</a>
		<!-- As a console, and as ZimaOS: the terminal at once, its login inside -->
		<div id="terminal">
			<div id="xterm" :class="[fullscreen ? 'fullheight' : 'sheight']" class="xterm"></div>
		</div>
	</fullscreen>
</template>

<script>
import qs from 'qs'
import 'xterm/css/xterm.css'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { AttachAddon } from 'xterm-addon-attach'
import { LOGIN_PORT_KEY, LOGIN_USER_KEY, opensFullScreen, parseLogin } from './terminalLogin'

const fitAddon = new FitAddon()
export default {
	name: 'terminal-card',
	props: {
		id: String,
		label: String,
		initWsUrl: String,
	},
	data() {
		return {
			// the Settings switch says how it opens
			fullscreen: opensFullScreen(),
			isConnecting: false,
			term: '',
			rows: 40,
			cols: 100,
			state: true,
			isVaild: false,
			wsUrl: '',
			// the login typed at the prompt: step user, then password
			step: 'user',
			line: '',
			sshUser: '',
			sshPassword: '',
			sshPort: 22,
			inputHandler: null,
		}
	},
	computed: {
		buttonSzie() {
			return this.$store.state.device == 'mobile' ? 'is-small' : ''
		},
		buttonIcon() {
			return this.fullscreen ? 'fullscreen-exit' : 'fullscreen'
		},
	},
	mounted() {
		this.rows = document.getElementById('terminal').offsetHeight / 16 - 6
		this.cols = document.getElementById('terminal').offsetWidth / 14

		// once the dialog has opened: a terminal made while it still animates
		// measures nothing, and draws nothing of what is written to it
		this.startTimer = setTimeout(() => {
			this.createTerm()
			if (this.initWsUrl) {
				this.isVaild = true
				this.wsUrl = this.initWsUrl
				this.initSocket()
			} else {
				this.promptLogin()
			}
		}, 350)
	},
	beforeUnmount() {
		clearTimeout(this.startTimer)
		if (this.socket) {
			this.socket.close()
		}
		if (this.term != '')
			this.term.dispose()
		window.removeEventListener('resize', this.onWindowResize)
	},

	methods: {
		// The prompt a console shows; the last user is offered, Enter takes it.
		promptLogin() {
			const last = localStorage.getItem(LOGIN_USER_KEY) || ''
			this.step = 'user'
			this.line = ''
			this.term.write(`\r\n${this.$t('recasos login')}${last ? ` (${last})` : ''}: `)
			this.inputHandler?.dispose()
			this.inputHandler = this.term.onData(data => this.onLoginInput(data, last))
		},
		// Typing at the login prompt: the user is echoed, the password is not.
		onLoginInput(data, last) {
			for (const ch of data) {
				if (ch === '\r') {
					this.term.write('\r\n')
					this.submitLine(last)
					return
				}
				if (ch === '\u0003') { // Ctrl+C starts over
					this.term.write('^C')
					this.promptLogin()
					return
				}
				if (ch === '\u007F' || ch === '\b') {
					if (this.line) {
						this.line = this.line.slice(0, -1)
						if (this.step === 'user') {
							this.term.write('\b \b')
						}
					}
					continue
				}
				if (ch >= ' ') {
					this.line += ch
					if (this.step === 'user') {
						this.term.write(ch)
					}
				}
			}
		},
		submitLine(last) {
			if (this.step === 'user') {
				const { user, port } = parseLogin(this.line || last, localStorage.getItem(LOGIN_PORT_KEY))
				if (!user) {
					this.promptLogin()
					return
				}
				this.sshUser = user
				this.sshPort = port
				this.step = 'password'
				this.line = ''
				this.term.write(`${this.$t('Password')}: `)
				return
			}
			this.sshPassword = this.line
			this.line = ''
			this.inputHandler?.dispose()
			this.inputHandler = null
			this.checkLogin()
		},
		async checkLogin() {
			this.$messageBus('terminallogs_connect')
			this.isConnecting = true
			const postData = {
				username: String(this.sshUser),
				password: String(this.sshPassword),
				port: String(this.sshPort),
			}
			try {
				await this.$api.sys.checkSshLogin(postData)
				localStorage.setItem(LOGIN_USER_KEY, this.sshUser)
				localStorage.setItem(LOGIN_PORT_KEY, String(this.sshPort))
				this.isVaild = true
				postData.token = this.$store.state.access_token
				this.wsUrl = `${this.$wsProtocol}//${this.$baseURL}/v1/sys/wsssh?${qs.stringify(postData)}`
				this.initSocket()
			} catch (error) {
				const why = error.response?.data?.data || error.message
				this.term.write(`\r\n${this.$t('Login incorrect')}${why ? ` (${why})` : ''}\r\n`)
				this.promptLogin()
			} finally {
				this.sshPassword = ''
				this.isConnecting = false
			}
		},
		toggleFullScreen() {
			this.fullscreen = !this.fullscreen
		},
		createTerm() {
			const term = new Terminal({
				fontSize: 13,
				cursorStyle: 'underline',
				cursorBlink: true,
				theme: { background: '#1E1E1E' },
				rows: Number.parseInt(this.rows),
				cols: Number.parseInt(this.cols),
				fontFamily: 'Consolas, Monaco, monospace',
			})
			term.loadAddon(fitAddon)
			term.open(document.getElementById('xterm'))
			fitAddon.fit()
			term.focus()
			this.term = term
			window.addEventListener('resize', this.onWindowResize)
		},
		// the session: the terminal talks to the socket from now on
		initTerm() {
			this.attach = new AttachAddon(this.socket)
			this.term.loadAddon(this.attach)
			this.term.focus()
			this.socket.send(JSON.stringify({
				type: 'resize',
				cols: this.term.cols,
				rows: this.term.rows,
			}))
		},
		initSocket() {
			this.socket = new WebSocket(this.wsUrl)
			this.socketOnClose()
			this.socketOnOpen()
			this.socketOnError()

			this.socket.onmessage = (event) => {
				if (event.data == '\r\n\u001B[?2004l\rlogout\r\n') {
					this.endSession()
				}
			}
		},
		socketOnOpen() {
			this.socket.onopen = () => {
				this.initTerm()
			}
		},
		socketOnClose() {
			this.socket.onclose = () => {
				if (this.isVaild && !this.initWsUrl) {
					this.endSession()
				}
			}
		},
		// the session ended: a console shows its login again
		endSession() {
			this.attach?.dispose()
			this.attach = null
			this.socket?.close()
			this.socket = null
			this.isVaild = false
			if (!this.initWsUrl) {
				this.promptLogin()
			}
		},
		socketOnError() {
			this.socket.onerror = () => {
				console.log('socket failure')
			}
		},
		onWindowResize() {
			if (!this.term) {
				return false
			}
			this.$nextTick(() => {
				try {
					fitAddon.fit()
					// the login prompt has no session to tell yet
					if (!this.isVaild || !this.socket) {
						return
					}
					this.socket.send(JSON.stringify({
						type: 'resize',
						cols: this.term.cols,
						rows: this.term.rows,
					}))
				} catch (e) {
					console.log('e', e.message)
				}
			})
		},
		getTop(e) {
			let offset = e.offsetTop
			if (e.offsetParent != null)
				offset += this.getTop(e.offsetParent)
			return offset
		},
		active(state) {
			this.state = state
			if (state) {
				this.onWindowResize()
			}
		},
	},
}
</script>

<style lang="scss" scoped>
#terminal {
	width: 100%;
	height: 100%;
	min-height: 35rem;
	font-size: 0.75rem;
}

.xterm {
	width: 100%;

	&.fullheight {
		height: 100%;
	}

	&.sheight {
		height: 35rem;
	}
}
</style>
