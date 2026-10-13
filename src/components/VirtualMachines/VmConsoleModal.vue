<template>
	<div ref="root" class="vm-console">
		<header class="vm-console-bar is-flex is-align-items-center">
			<span :class="`vm-dot vm-dot-${dot}`"></span>
			<h3 class="title is-6 mb-0 mr-4 one-line">{{ vm.title }}</h3>
			<span class="is-size-7 has-text-grey-light mr-auto">{{ statusText }}</span>

			<template v-if="connected">
				<b-button v-for="mod in modifiers" :key="mod.name" :class="{ 'is-active': held[mod.name] }"
					class="mr-1 key-btn" size="is-small" :title="$t('Held until pressed again')" @click="toggleModifier(mod)">
					{{ mod.label }}
				</b-button>
				<b-button class="mr-1 key-btn" size="is-small" @click="tap(KEY.Tab)">Tab</b-button>
				<b-button class="mr-1 key-btn" size="is-small" @click="tap(KEY.Escape)">Esc</b-button>
				<b-button class="mr-3 key-btn" size="is-small" @click="ctrlAltDel">Ctrl+Alt+Del</b-button>
				<b-button :loading="typing" class="mr-1" icon-left="content-paste" size="is-small"
					:title="$t('Type the clipboard text into the VM')" @click="pasteDialog = true">
					{{ $t('Paste as keys') }}
				</b-button>
			</template>
			<b-button class="mr-1" icon-left="fullscreen" size="is-small" :title="$t('Full screen')" @click="fullscreen" />
			<div class="close-button ml-2 is-clickable" @click="$emit('close')">
				<b-icon icon="close-outline" pack="casa"></b-icon>
			</div>
		</header>

		<div class="vm-console-screen">
			<div ref="screen" class="vm-console-canvas"></div>

			<div v-if="!connected" class="vm-console-overlay is-flex is-flex-direction-column is-align-items-center is-justify-content-center">
				<template v-if="canStart">
					<b-button :loading="starting" class="power-btn" rounded size="is-large" type="is-primary" @click="start">
						<b-icon icon="shutdown-outline" pack="casa" />
					</b-button>
					<p class="mt-3 has-text-grey-light">{{ $t('The virtual machine is off.') }}</p>
				</template>
				<template v-else>
					<p class="has-text-grey-light">{{ message || $t('Connecting…') }}</p>
					<b-button v-if="message" class="mt-3" rounded size="is-small" @click="connect">{{ $t('Reconnect') }}</b-button>
				</template>
			</div>
		</div>

		<b-modal v-model="pasteDialog" :can-cancel="['escape', 'outside']" custom-class="vm-paste-modal" has-modal-card>
			<div class="modal-card vm-paste">
				<header class="modal-card-head b-line">
					<h3 class="title is-5 has-text-black">{{ $t('Paste as keys') }}</h3>
				</header>
				<section class="modal-card-body">
					<p class="is-size-7 has-text-full-03 mb-2">
						{{ $t('The text is typed into the VM one key at a time, as if on a US keyboard layout.') }}
					</p>
					<b-input v-model="pasteText" maxlength="4096" type="textarea"></b-input>
				</section>
				<footer class="modal-card-foot is-flex is-justify-content-flex-end">
					<b-button class="mr-2" rounded @click="pasteDialog = false">{{ $t('Cancel') }}</b-button>
					<b-button :disabled="!pasteText" rounded type="is-primary" @click="typeText">{{ $t('Type it') }}</b-button>
				</footer>
			</div>
		</b-modal>
	</div>
</template>

<script>
import escape from 'lodash/escape'
import { markRaw } from 'vue'
import RFB from '@novnc/novnc'
import vmApi from './api'
import { KEYSYM as KEY, allowedActions, keysForText, stateDot, stateLabel } from './vms'

// between two typed keys; 4 KB of text takes about a minute
const TYPE_DELAY_MS = 15

export default {
	name: 'VmConsoleModal',
	props: {
		vm: { type: Object, required: true },
	},
	emits: ['close'],
	data() {
		return {
			KEY,
			rfb: null,
			connected: false,
			message: '',
			starting: false,
			state: this.vm.state,
			held: { ctrl: false, alt: false, win: false },
			modifiers: [
				{ name: 'ctrl', label: 'Ctrl', keysym: KEY.ControlL, code: 'ControlLeft' },
				{ name: 'alt', label: 'Alt', keysym: KEY.AltL, code: 'AltLeft' },
				{ name: 'win', label: 'Win', keysym: KEY.SuperL, code: 'MetaLeft' },
			],
			pasteDialog: false,
			pasteText: '',
			typing: false,
		}
	},
	computed: {
		dot() {
			return stateDot(this.state)
		},
		canStart() {
			return allowedActions(this.state).start
		},
		statusText() {
			return this.$t(stateLabel(this.state))
		},
	},
	mounted() {
		if (allowedActions(this.state).console) {
			this.connect()
		}
	},
	beforeUnmount() {
		this.disconnect()
	},
	methods: {
		connect() {
			this.disconnect()
			this.message = ''

			let rfb
			try {
				// raw: kept out of Vue's reactivity, and so comparable to itself below
				rfb = markRaw(new RFB(this.$refs.screen, vmApi.consoleURL(this.$wsProtocol, this.vm.id), { wsProtocols: ['binary'] }))
			} catch (e) {
				this.message = e.message
				return
			}

			this.rfb = rfb
			rfb.scaleViewport = true
			rfb.focusOnClick = true
			// Events of a connection this component has since dropped -- it was
			// replaced, or the console was closed -- are not about it any more.
			rfb.addEventListener('connect', () => {
				if (this.rfb !== rfb) {
					return
				}
				this.connected = true
				rfb.focus()
			})
			rfb.addEventListener('disconnect', (e) => {
				if (this.rfb !== rfb) {
					return
				}
				this.connected = false
				this.rfb = null
				this.held = { ctrl: false, alt: false, win: false }
				if (!allowedActions(this.state).start) {
					this.message = e.detail.clean ? this.$t('The console was closed.') : this.$t('The connection to the console was lost.')
				}
			})
		},
		disconnect() {
			if (this.rfb) {
				const rfb = this.rfb
				this.rfb = null
				rfb.disconnect()
			}
			this.connected = false
		},
		tap(keysym, code) {
			if (!this.rfb) {
				return
			}
			this.rfb.sendKey(keysym, code || null)
			this.rfb.focus()
		},
		toggleModifier(mod) {
			if (!this.rfb) {
				return
			}
			const down = !this.held[mod.name]
			this.rfb.sendKey(mod.keysym, mod.code, down)
			this.held[mod.name] = down
			this.rfb.focus()
		},
		ctrlAltDel() {
			if (this.rfb) {
				this.rfb.sendCtrlAltDel()
				this.rfb.focus()
			}
		},
		// One key at a time, with a pause: sent all at once, a long text overruns
		// the guest's keyboard buffer and characters are lost.
		async typeText() {
			const rfb = this.rfb
			const keys = keysForText(this.pasteText)
			this.pasteDialog = false
			this.pasteText = ''
			if (!rfb) {
				return
			}

			this.typing = true
			try {
				for (const { keysym, shift } of keys) {
					if (this.rfb !== rfb) {
						return
					}
					if (shift) {
						rfb.sendKey(KEY.ShiftL, null, true)
					}
					rfb.sendKey(keysym, null)
					if (shift) {
						rfb.sendKey(KEY.ShiftL, null, false)
					}
					await new Promise(resolve => setTimeout(resolve, TYPE_DELAY_MS))
				}
			} finally {
				this.typing = false
				rfb.focus()
			}
		},
		fullscreen() {
			const el = this.$refs.root
			if (document.fullscreenElement) {
				document.exitFullscreen()
			} else if (el.requestFullscreen) {
				el.requestFullscreen()
			}
		},
		async start() {
			this.starting = true
			try {
				const res = await vmApi.action(this.vm.id, 'start')
				this.state = res.data.data.state
				this.connect()
			} catch (e) {
				// shown as HTML by the toast: escaped
				this.$buefy.toast.open({ message: escape(e.response?.data?.message || e.message), type: 'is-danger', duration: 5000 })
			} finally {
				this.starting = false
			}
		},
	},
	sockets: {
		'vm:state-changed': function (res) {
			const p = res.Properties || {}
			if (p['vm:id'] !== this.vm.id || !p['vm:state']) {
				return
			}
			const before = this.state
			this.state = p['vm:state']
			// a VM started from elsewhere, or rebooted by its guest
			if (!this.connected && !this.rfb && !allowedActions(before).console && allowedActions(this.state).console) {
				this.connect()
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.vm-console {
	display: flex;
	flex-direction: column;
	width: 100vw;
	height: 100vh;
	background: #111;
}

.vm-console-bar {
	flex-shrink: 0;
	gap: 0;
	padding: 0.5rem 1rem;
	background: #1d2228;
	color: #e8edf2;

	.title {
		color: #e8edf2;
		max-width: 30vw;
	}

	.key-btn.is-active {
		background: #1f7ae0;
		border-color: #1f7ae0;
		color: white;
	}

	.close-button {
		color: #e8edf2;
	}
}

.vm-console-screen {
	position: relative;
	flex: 1;
	min-height: 0;
}

.vm-console-canvas {
	width: 100%;
	height: 100%;
	overflow: hidden;
}

.vm-console-overlay {
	position: absolute;
	inset: 0;
}

.power-btn {
	width: 5rem;
	height: 5rem;
}

.vm-dot {
	display: inline-block;
	flex-shrink: 0;
	width: 0.6rem;
	height: 0.6rem;
	border-radius: 50%;
	margin-right: 0.5rem;
	background: #9aa4ae;

	&.vm-dot-start {
		background: #3dd26b;
	}

	&.vm-dot-busy {
		background: #f5a623;
	}
}
</style>

<style lang="scss">
// the Buefy modal the console opens in: edge to edge, no card around it. Only
// its own content: the paste dialog is a modal inside it, and stays centred.
.vm-console-modal {
	> .animation-content,
	> .modal-content {
		width: 100%;
		max-width: 100% !important;
		max-height: 100vh;
		margin: 0;
		overflow: hidden;
	}

	// the paste dialog, a modal inside this one, inherits the full-screen width
	// rules; it is an ordinary dialog
	.vm-paste-modal > .animation-content {
		width: 32rem;
		max-width: calc(100vw - 2rem) !important;
		margin: 0 auto;
	}
}
</style>
