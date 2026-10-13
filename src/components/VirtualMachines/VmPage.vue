<template>
	<div class="modal-card vm-page">
		<!-- the terminal panel's header: title, add, close -->
		<header class="modal-card-head">
			<div class="is-flex is-align-items-center is-flex-grow-1">
				<h3 class="title is-header mb-0 mr-2">{{ $t('Virtual Machines') }}</h3>
				<b-icon v-if="available" class="close-button" icon="plus-outline" pack="casa"
					:title="$t('New virtual machine')" @click="create" />
				<b-icon v-if="available" class="close-button ml-2" icon="cog-outline"
					:title="$t('Virtual machine settings')" @click="openSettings" />
			</div>
			<span v-if="available" class="kvm-badge" :class="[host.kvm ? 'is-on' : 'is-off']">
				QEMU / KVM {{ host.kvm ? $t('active') : $t('not available') }}
			</span>
			<b-icon class="close-button ml-2" icon="close-outline" pack="casa" @click="$emit('close')" />
		</header>

		<section class="modal-card-body">
			<b-loading :active="loading && !vms.length" :is-full-page="false"></b-loading>

			<!-- libvirt missing: say what to install, from what the service found -->
			<div v-if="!loading && !available" class="vm-empty has-text-centered">
				<b-image :src="require('@/assets/img/app/vms.svg')" class="is-64x64 mx-auto mb-4" />
				<p class="title is-5">{{ $t('Virtual machines are not available on this system.') }}</p>
				<p class="has-text-full-03 mb-3">{{ host.reason || error }}</p>
				<p class="is-size-7 has-text-full-03">
					{{ $t('They need libvirt and QEMU. On Debian or Ubuntu:') }}
				</p>
				<pre class="is-size-7 mt-2">sudo apt install qemu-system libvirt-daemon-system ovmf</pre>
			</div>

			<div v-else-if="!loading && !vms.length" class="vm-empty has-text-centered">
				<b-image :src="require('@/assets/img/app/vms.svg')" class="is-64x64 mx-auto mb-4" />
				<p class="title is-5">{{ $t('No virtual machines yet') }}</p>
				<p class="has-text-full-03 mb-4">
					{{ $t('Create one from an ISO or a disk image. Put images in /DATA/VM/iso with Files.') }}
				</p>
				<b-button rounded type="is-primary" @click="create">{{ $t('New virtual machine') }}</b-button>
			</div>

			<template v-else-if="vms.length">
				<p v-if="host.kvm === false" class="is-size-7 vm-warning mb-3">
					{{ $t('KVM is not available: virtual machines run without hardware acceleration and will be slow.') }}
				</p>
				<div class="vm-split">
					<!-- master: every VM, in the user's order -->
					<draggable v-model="vms" :animation="200" class="vm-list" ghost-class="ghost" item-key="id" tag="div"
						@end="saveOrder">
						<template #item="{ element: vm }">
							<div :class="{ 'is-selected': selected && vm.id === selected.id }" class="vm-item" role="button"
								@click="selectedId = vm.id">
								<os-icon :os="vm.os" />
								<div class="vm-item-text">
									<p class="vm-item-title" :title="vm.title">{{ vm.title }}</p>
									<p :class="`vm-item-state state-${stateDot(vm.state)}`">
										{{ $t(stateLabel(vm.state)) }}
									</p>
									<p v-if="listAddress(vm)" :class="{ 'is-stale': listAddress(vm).stale }" class="vm-item-ip">
										<span :title="listAddress(vm).ip">{{ listAddress(vm).ip }}</span>
										<b-icon :title="$t('Copy')" class="vm-item-copy" icon="content-copy" size="is-small"
											@click.stop="copyAddress(listAddress(vm).ip)" />
									</p>
								</div>
								<b-loading :active="!!busy[vm.id] || vm.state === 'creating'" :can-cancel="false" :is-full-page="false" />
								<span :class="`vm-dot vm-dot-${stateDot(vm.state)}`"></span>
							</div>
						</template>
					</draggable>

					<!-- detail: the one selected -->
					<div class="vm-detail-pane">
						<vm-detail v-if="selected" :key="selected.id" :busy="!!busy[selected.id] || selected.state === 'creating'"
							:host="host" :images="images" :vm="selected" @action="onAction" @images-changed="loadImages" @updated="replace" />
					</div>
				</div>
			</template>
		</section>
	</div>
</template>

<script>
import copy from 'clipboard-copy'
import draggable from 'vuedraggable'
import OsIcon from './OsIcon.vue'
import vmApi from './api'
import VmConsoleModal from './VmConsoleModal.vue'
import VmCreateModal from './VmCreateModal.vue'
import VmDeleteModal from './VmDeleteModal.vue'
import StorageSettingsModal from './StorageSettingsModal.vue'
import VmDetail from './VmDetail.vue'
import { applyOrder, listAddress, stateDot, stateLabel } from './vms'

const ORDER_KEY = 'vm_order'

export default {
	name: 'VmPage',
	components: {
		Draggable: draggable,
		OsIcon,
		VmDetail,
	},
	emits: ['close'],
	data() {
		return {
			host: {},
			vms: [],
			order: [],
			busy: {},
			images: [],
			selectedId: '',
			loading: true,
			error: '',
		}
	},
	computed: {
		available() {
			return this.host.libvirt === 'available'
		},
		// the VM picked in the list, or the first one
		selected() {
			return this.vms.find(vm => vm.id === this.selectedId) || this.vms[0] || null
		},
	},
	mounted() {
		this.load()
	},
	methods: {
		listAddress,
		stateDot,
		stateLabel,
		copyAddress(ip) {
			copy(ip)
			this.$buefy.toast.open({ message: this.$t('Copied to clipboard'), type: 'is-success' })
		},
		async loadImages() {
			try {
				const res = await vmApi.images()
				this.images = res.data.data || []
			} catch {
				// the CD-ROM list only: Browse still works
				this.images = []
			}
		},
		async load() {
			this.loading = true
			try {
				const res = await vmApi.host()
				this.host = res.data.data || {}
				if (this.available) {
					await this.refresh()
					this.loadImages()
				}
			} catch (e) {
				this.error = e.response?.data?.message || e.message
			} finally {
				this.loading = false
			}
		},
		async refresh() {
			try {
				const [list, saved] = await Promise.all([
					vmApi.list().then(res => res.data.data || []),
					this.$api.users.getCustomStorage(ORDER_KEY).then(res => res.data.data?.data || []).catch(() => []),
				])
				const { sorted, order } = applyOrder(list, saved)
				this.vms = sorted
				this.order = order
			} catch (e) {
				this.toastError(e)
			}
		},
		// one VM, from the service, in place
		async refreshOne(id) {
			try {
				const res = await vmApi.get(id)
				this.replace(res.data.data)
			} catch (e) {
				if (e.response?.status === 404) {
					this.vms = this.vms.filter(vm => vm.id !== id)
				}
			}
		},
		replace(vm) {
			const i = this.vms.findIndex(v => v.id === vm.id)
			if (i >= 0) {
				this.vms.splice(i, 1, vm)
			} else {
				this.vms.push(vm)
			}
		},
		saveOrder() {
			this.order = this.vms.map(vm => vm.id)
			this.$api.users.setCustomStorage(ORDER_KEY, { data: this.order }).catch(() => {})
		},
		toastError(e) {
			this.$buefy.toast.open({ message: e.response?.data?.message || e.message, type: 'is-danger', duration: 5000 })
		},
		create() {
			this.$buefy.modal.open({
				component: VmCreateModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				props: { host: this.host },
				events: {
					created: (vm, importing) => {
						this.replace(vm)
						this.selectedId = vm.id
						if (importing) {
							this.$buefy.toast.open({ message: this.$t('Copying the disk image. The VM will be ready in a few minutes.'), type: 'is-info', duration: 5000 })
						}
					},
				},
			})
		},
		openSettings() {
			this.$buefy.modal.open({
				component: StorageSettingsModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				props: { host: this.host },
				events: {
					saved: (folder) => {
						this.host = { ...this.host, storage_path: folder.path, storage_free_bytes: folder.free_bytes }
						this.loadImages()
					},
				},
			})
		},
		openConsole(vm) {
			this.$buefy.modal.open({
				component: VmConsoleModal,
				fullScreen: true,
				// Esc belongs to the VM: installers and editors need it. The console
				// closes from its own button only.
				canCancel: [],
				customClass: 'vm-console-modal',
				props: { vm },
			})
		},
		async onAction(action, vm) {
			switch (action) {
				case 'console':
					return this.openConsole(vm)
				case 'delete':
					return this.$buefy.modal.open({
						component: VmDeleteModal,
						hasModalCard: true,
						trapFocus: true,
						canCancel: ['escape'],
						props: { vm },
						events: {
							deleted: (deleted) => {
								this.vms = this.vms.filter(v => v.id !== deleted.id)
								this.saveOrder()
							},
						},
					})
				default:
					return this.run(vm, () => vmApi.action(vm.id, action), action === 'start')
			}
		},
		async run(vm, call, openAfter) {
			this.busy = { ...this.busy, [vm.id]: true }
			try {
				const res = await call()
				this.replace(res.data.data)
				if (openAfter) {
					this.openConsole(res.data.data)
				}
			} catch (e) {
				this.toastError(e)
			} finally {
				const { [vm.id]: _, ...rest } = this.busy
				this.busy = rest
			}
		},
	},
	sockets: {
		'vm:state-changed': function (res) {
			const id = res.Properties?.['vm:id']
			if (!id || !this.available) {
				return
			}
			if (res.Properties['vm:event'] === 'undefined') {
				this.vms = this.vms.filter(vm => vm.id !== id)
			} else {
				this.refreshOne(id)
			}
		},
		'vm:create-end': function (res) {
			const id = res.Properties?.['vm:id']
			if (id) {
				this.refreshOne(id)
			}
		},
		'vm:create-error': function (res) {
			const p = res.Properties || {}
			this.vms = this.vms.filter(vm => vm.id !== p['vm:id'])
			this.$buefy.toast.open({
				message: this.$t('{name} could not be created: {message}', { name: p['vm:title'] || '', message: p.message || '' }),
				type: 'is-danger',
				duration: 8000,
			})
		},
	},
}
</script>

<style lang="scss" scoped>
.vm-page {
	.modal-card-body {
		position: relative;
		min-height: 16rem;
	}

	.kvm-badge {
		flex-shrink: 0;
		padding: 0.15rem 0.6rem;
		border-radius: 1rem;
		font-size: 0.75rem;
		font-weight: 500;

		&.is-on {
			color: #1f9d4c;
			background: rgba(61, 210, 107, 0.15);
		}

		&.is-off {
			color: #b86e00;
			background: rgba(245, 166, 35, 0.15);
		}
	}

	.vm-split {
		display: grid;
		grid-template-columns: 16rem minmax(0, 1fr);
		gap: 1rem;
		align-items: start;

		@include touch {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.vm-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.5rem;
		border-radius: 0.75rem;
		background: var(--casa-surface-sunken);
		border: 1px solid var(--casa-border);
	}

	.vm-item {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.625rem;
		border-radius: 0.5rem;
		border: 1px solid transparent;
		cursor: pointer;

		&:hover {
			background: var(--casa-hover-tile);
		}

		&.is-selected {
			border-color: var(--casa-primary, #3b82f6);
			background: var(--casa-hover-tile);
		}

		:deep(.loading-overlay) {
			border-radius: 0.5rem;
		}
	}

	.vm-item-text {
		flex-grow: 1;
		min-width: 0;
	}

	.vm-item-title {
		overflow: hidden;
		color: var(--casa-text-strong);
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vm-item-state {
		overflow: hidden;
		font-size: 0.75rem;
		color: var(--casa-text-dim);
		text-overflow: ellipsis;
		white-space: nowrap;

		&.state-start {
			color: #1f9d4c;
		}
	}

	.vm-item-ip {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.75rem;
		color: var(--casa-text);

		span {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		&.is-stale {
			color: var(--casa-text-dim);
		}
	}

	.vm-item-copy {
		flex-shrink: 0;
		color: var(--casa-text-dim);
		opacity: 0;
		cursor: pointer;

		&:hover {
			color: var(--casa-primary, #3b82f6);
		}
	}

	.vm-item:hover .vm-item-copy,
	.vm-item.is-selected .vm-item-copy {
		opacity: 1;
	}

	.vm-dot {
		flex-shrink: 0;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: #e5484d;

		&.vm-dot-start {
			background: #3dd26b;
		}

		&.vm-dot-busy {
			background: #f5a623;
		}
	}

	.vm-detail-pane {
		min-width: 0;
		min-height: 30rem;
		padding: 1rem 1.25rem;
		border-radius: 0.75rem;
		border: 1px solid var(--casa-border);
	}

	.vm-empty {
		max-width: 28rem;
		margin: 3rem auto;

		pre {
			display: inline-block;
			border-radius: 0.375rem;
			background: var(--casa-surface-sunken);
			color: var(--casa-text-strong);
		}
	}

	// the warning yellow is unreadable on a light card
	.vm-warning {
		color: #a15c00;
	}
}
</style>

<style lang="scss">
// The modal the page opens in, in the colours every modal has: the list on
// the left, the selected VM on the right.
.vm-modal {
	.animation-content {
		width: 66rem;
		max-width: calc(100vw - 2rem) !important;
	}

	.modal-card.vm-page {
		width: 100%;
		max-height: calc(100vh - 5rem);

		.modal-card-body {
			overflow-y: auto;
		}
	}
}
</style>
