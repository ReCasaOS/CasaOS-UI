<template>
	<!-- A VM in the app grid. A button of its own, so Enter and Space open it;
		no menu: a VM is not an app, and has none of an app's actions. -->
	<button :aria-label="label" :title="label" class="common-card app-card vm-tile is-flex is-align-items-center is-justify-content-center"
		type="button" @click="open">
		<div class="blur-background"></div>
		<div class="cards-content">
			<div class="has-text-centered is-flex is-justify-content-center is-flex-direction-column pt-5 pb-3px img-c">
				<div class="is-flex is-justify-content-center">
					<!-- the mark of the system it runs, in that system's colour; a screen,
						drawn in the theme's own colours, when it runs no system the list knows -->
					<span aria-hidden="true" class="vm-tile-screen">
						<i v-if="os" :class="`mdi mdi-${os.icon}`" :style="os.color ? { color: os.color } : {}" class="vm-tile-os"></i>
						<svg v-else fill="none" height="36" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
							viewBox="0 0 24 24" width="36">
							<rect height="13" rx="2" width="18" x="3" y="4" />
							<path d="M8 21h8M12 17v4" />
						</svg>
						<span :class="`vm-dot-${dot}`" :title="stateText" class="vm-tile-dot"></span>
						<span class="vm-tile-chip">VM</span>
					</span>
				</div>
				<p class="mt-3 one-line vm-tile-name">{{ name }}</p>
			</div>
		</div>
	</button>
</template>

<script>
import { allowedActions, osInfo, stateLabel } from './vms'
import { getVirtualMachine, openVirtualMachines, openVmConsole } from './entry'

// what a name may take of the card and of what is read out
const NAME_MAX = 64
// how long a click waits for the VM's state before going by the one it has
const READ_MS = 5000

// the dot: running, paused, stopped, or anything else (crashed, starting, stopping...)
function tileState(state) {
	switch (state) {
		case 'running':
			return 'running'
		case 'paused':
			return 'paused'
		case 'shut-off':
			return 'stopped'
		default:
			return 'other'
	}
}

export default {
	name: 'VmTile',
	props: {
		vm: { type: Object, required: true },
	},
	computed: {
		name() {
			const chars = [...String(this.vm.title || this.vm.name || '')]
			return chars.length > NAME_MAX ? `${chars.slice(0, NAME_MAX - 1).join('')}…` : chars.join('')
		},
		// the system's entry of OS_LIST, or null for none or one the list does not have
		os() {
			const info = osInfo(this.vm.os)
			return info.value ? info : null
		},
		hasConsole() {
			return allowedActions(this.vm.state).console
		},
		dot() {
			return tileState(this.vm.state)
		},
		stateText() {
			return this.$t(stateLabel(this.vm.state))
		},
		label() {
			return this.hasConsole
				? this.$t('Console of {name}', { name: this.name })
				: this.$t('{name}, {state}: open in Virtual Machines', { name: this.name, state: this.stateText })
		},
	},
	created() {
		// a click being handled: a second one opens nothing more
		this.opening = false
	},
	methods: {
		// The console where there is one; the page on this VM otherwise. Never a
		// start: a click on a tile does not power a machine on. The state shown may
		// be a poll old, so it is read again first; if that read fails, the tile
		// goes by what it has.
		async open() {
			if (this.opening) {
				return
			}
			this.opening = true
			let vm = this.vm
			try {
				const now = await getVirtualMachine(this.vm.id, READ_MS)
				if (now?.id === this.vm.id) {
					vm = now
				}
			} catch {
				// the state the tile has
			}
			try {
				if (allowedActions(vm.state).console) {
					openVmConsole(this.$buefy, vm)
				} else {
					openVirtualMachines(this.$buefy, this.$store.state, vm.id)
				}
			} finally {
				this.opening = false
			}
		},
	},
}
</script>

<style lang="scss" scoped>
// a button that looks like the other cards
.vm-tile {
	width: 100%;
	padding: 0;
	border: 0;
	font: inherit;
	color: var(--casa-on-glass);
	background: none;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--casa-on-glass);
		outline-offset: 2px;
	}
}

.vm-tile-name {
	color: var(--casa-on-glass);
}

// Opaque, so its contrast does not hang on the wallpaper: --casa-text on
// --casa-surface, 12.71:1 light and 13.37:1 dark. Outlined, where an app's
// icon is a picture.
.vm-tile-screen {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 4rem;
	height: 4rem;
	border: 2px solid var(--casa-text);
	border-radius: 0.875rem;
	color: var(--casa-text);
	background: var(--casa-surface);
	transition: all 0.3s;
}

// as large as the screen it stands for; a system with no colour of its own
// (Linux) takes --casa-text, as the screen does
.vm-tile-os {
	font-size: 2.25rem;
	line-height: 1;
}

.img-c:hover .vm-tile-screen {
	transform: scale3d(1.1, 1.1, 1.1);
}

// the chip: the same pair, inverted (12.71:1 and 13.37:1)
.vm-tile-chip {
	position: absolute;
	right: -0.5rem;
	bottom: -0.375rem;
	padding: 0 0.3rem;
	border-radius: 0.375rem;
	color: var(--casa-surface);
	background: var(--casa-text);
	font-size: 0.6875rem;
	font-weight: 700;
	line-height: 1rem;
}

// On --casa-surface; each at least 3:1 in both themes (light / dark): running
// 3.51 / 4.64, paused 3.99 / 4.09, stopped 3.67 / 4.44, other 4.40 / 3.71. The
// state is in words too, in the title and in what is read out.
.vm-tile-dot {
	position: absolute;
	top: 0.3rem;
	right: 0.3rem;
	width: 0.625rem;
	height: 0.625rem;
	border-radius: 50%;

	&.vm-dot-running {
		background: #1f9d4c;
	}

	&.vm-dot-paused {
		background: #b86e00;
	}

	&.vm-dot-stopped {
		background: #7a8794;
	}

	// a ring, so it differs by shape as well as colour
	&.vm-dot-other {
		border: 2px solid #d6453d;
	}
}
</style>
