<template>
	<div>
		<!-- Disk Info Start -->
		<div class="widget has-text-white disk is-relative">
			<div class="blur-background"></div>
			<div class="widget-content">
				<!-- Header Start -->
				<div class="widget-header is-flex">
					<div class="widget-title is-flex-grow-1">
						{{ $t('Storage') }}
					</div>
					<div class="widget-icon-button is-flex-shrink-0" @click="showDiskManagement">
						<b-icon icon="settings-outline" pack="casa" size="is-20"></b-icon>
					</div>
				</div>
				<!-- Header End -->
				<div class="columns is-mobile is-multiline pt-2 ">
					<div class="column is-full pb-0">
						<div class="is-flex is-align-items-center">
							<div class="header-icon">
								<b-image :src="require('@/assets/img/storage/storage.svg')" class="is-64x64"></b-image>
							</div>
							<div class="ml-2 is-flex-grow-1 ">
								<h4 class="title mb-1 mt-0 has-text-left one-line is-align-items-center is-flex">
									<b-tag v-if="health === 'passed'" type="is-success">{{ $t('Healthy') }}</b-tag>
									<b-tag v-else-if="health === 'failed'" type="is-danger">{{ $t('Damage') }}</b-tag>
									<b-tag v-else type="is-light">{{ $t('No SMART data') }}</b-tag>
									<b-tag v-if="raidTag" :type="raidTag.type" class="ml-2 raid-tag">RAID: {{ raidTag.text }}</b-tag>
								</h4>
								<p class="has-text-left is-size-14px disk-info">
									{{ $t('Used') }}: {{ renderSize(totalUsed) }}<br>
									{{ $t('Total') }}: {{ renderSize(totalSize) }}
								</p>
							</div>
						</div>
						<b-progress :type="getProgressType(totalPercent)" :value="totalPercent" class="mt-2"
							size="is-small"></b-progress>
						<div v-if="reclaimable.count > 0" class="is-flex is-align-items-center mt-2">
							<p class="has-text-left is-size-14px disk-info is-flex-grow-1">
								{{ $t('Old app versions: {count}', { count: reclaimable.count }) }}
								&nbsp;&middot;&nbsp;{{ renderSize(reclaimable.size) }}
							</p>
							<b-button :loading="isReclaiming" class="is-flex-shrink-0" size="is-small" type="is-light"
								@click="confirmReclaim">{{ $t('Free up') }}</b-button>
						</div>
					</div>
				</div>
			</div>
		</div>
		<!-- Disk Info End -->
		<!-- Usb Disk List Start -->
		<div v-if="usbDisks.length > 0" class="widget has-text-white disk is-relative">
			<div class="blur-background"></div>
			<div class="widget-content">
				<div class="columns is-mobile is-multiline pt-2 ">
					<div v-for="(item) in usbDisks" :key="`usb_${item.name}`" class="column is-full pb-0">
						<div class="is-flex">
							<div class="header-icon is-flex-shrink-0">
								<b-image :src="require('@/assets/img/storage/USB.svg')" class="is-64x64"></b-image>
							</div>
							<div class="ml-2 is-flex-grow-1 ">
								<h4 class="title is-size-14px mb-1 mt-0 has-text-left has-text-white one-line ">
									{{ item.model }}
								</h4>
								<p class="has-text-left is-size-14px disk-info">
									{{ $t('Used') }}: {{ renderSize(usbUsed(item)) }}<br>
									{{ $t('Total') }}: {{ renderSize(item.size) }}
								</p>
							</div>
						</div>
						<b-progress :type="getProgressType(usbPercent(item))"
							:value="usbPercent(item)" class="mt-2"
							size="is-small"></b-progress>
					</div>
				</div>
			</div>
		</div>

		<!-- Usb Disk List End -->
	</div>
</template>

<script>
import StorageManagerPanel from '@/components/Storage/StorageManagerPanel.vue'
import { raidNeedsAttention, raidTag } from '@/components/Storage/raid'
import { mixin } from '@/mixins/mixin'

export default {
	name: 'disks',
	icon: 'storage-outline',
	title: 'Storage Status',
	initShow: true,
	mixins: [mixin],

	data() {
		return {
			totalSize: 0,
			totalUsed: 0,
			totalPercent: 0,
			health: 'passed',
			usbDisks: [],
			raidArrays: [],
			raidTimer: null,
			reclaimable: { count: 0, size: 0 },
			// The prune is synchronous and answers with the bytes it actually freed, so
			// there is nothing to report until the daemon has finished walking the layers
			// -- which on a box with a few dozen old images is seconds of a button that
			// looked like it had done nothing.
			isReclaiming: false,
		}
	},

	mounted() {
		this.getDiskInfo(this.$store.state.hardwareInfo.sys_disk)
		this.usbDisks = this.$store.state.hardwareInfo.sys_usb
		this.loadReclaimable()
		this.loadRAID()
		this.raidTimer = setInterval(this.loadRAID, 60 * 1000)
	},
	beforeUnmount() {
		clearInterval(this.raidTimer)
	},
	computed: {
		// the first array that needs someone (a disk missing or failed, a rebuild, an array stopped); none when all are fine
		raidTag() {
			const array = this.raidArrays.find(raidNeedsAttention)
			return array ? raidTag(array, this.$t) : null
		},
	},
	methods: {
		getDiskInfo(diskInfo) {
			this.totalSize = diskInfo.size
			this.totalUsed = diskInfo.used
			this.totalPercent = this.totalSize > 0
				? Math.min(100, Math.floor(diskInfo.used * 100 / this.totalSize))
				: 0
			this.health = this.smartHealth(diskInfo)
		},
		usbUsed(item) {
			const used = Number(item.used)
			if (Number.isFinite(used) && used >= 0) {
				return used
			}
			return Math.max(0, Number(item.size) - Number(item.avail))
		},
		usbPercent(item) {
			const size = Number(item.size)
			if (!Number.isFinite(size) || size <= 0) {
				return 0
			}
			return Math.min(100, Math.floor(this.usbUsed(item) * 100 / size))
		},

		// Silent on failure. This is an offer, not a reading: a dashboard that pops an
		// error because it could not reach the Docker socket helps nobody, and the row
		// simply stays hidden.
		// silent on failure, as the line above: an older LocalStorage has no such route
		loadRAID() {
			Promise.resolve().then(() => this.$api.disks.raid()).then((res) => {
				this.raidArrays = res.data.data || []
			}).catch(() => {})
		},

		loadReclaimable() {
			this.$openAPI.appManagement.image.danglingImages().then((res) => {
				this.reclaimable = res.data.data ?? { count: 0, size: 0 }
			}).catch(() => {})
		},

		confirmReclaim() {
			this.$buefy.dialog.confirm({
				title: this.$t('Free up {size}', { size: this.renderSize(this.reclaimable.size) }),
				message: this.$t('Updating an app leaves the version it replaced on the disk. Deleting those frees the space. No installed app is affected, and nothing has to be downloaded again. Old versions to delete: {count}', { count: this.reclaimable.count }),
				type: 'is-dark',
				confirmText: this.$t('Delete'),
				cancelText: this.$t('Cancel'),
				onConfirm: () => this.reclaim(),
			})
		},

		// The daemon can free less than it was asked to, or nothing at all, so what is
		// left is re-read rather than assumed empty.
		reclaim() {
			this.isReclaiming = true
			this.$openAPI.appManagement.image.pruneDanglingImages().then((res) => {
				this.$buefy.toast.open({
					message: this.$t('Freed {size}', { size: this.renderSize(res.data.data?.size ?? 0) }),
					position: 'is-top',
					duration: 5000,
				})
			}).catch((err) => {
				this.$buefy.toast.open({
					message: err.response?.data?.message || err.message,
					type: 'is-danger',
					position: 'is-top',
					duration: 5000,
				})
			}).finally(() => {
				this.isReclaiming = false
				this.loadReclaimable()
			})
		},

		showDiskManagement() {
			this.$messageBus('widget_storagemanager')
			this.$buefy.modal.open({
				component: StorageManagerPanel,
				hasModalCard: true,
				customClass: 'storage-modal',
				trapFocus: true,
				canCancel: [],
				scroll: 'keep',
				animation: 'zoom-in',
			})
		},
	},
	sockets: {
		'casaos:system:utilization': function (res) {
			const data = res.Properties
			// DISK
			this.getDiskInfo(JSON.parse(data.sys_disk))
			// USB
			this.usbDisks = JSON.parse(data.sys_usb)
		},
	},
}
</script>

<style lang="scss">
.disk {
	.progress {
		border-radius: 6px;
		height: 12px;

		&::-webkit-progress-bar {
			background: rgba(172, 184, 195, 0.4);
		}

		&::-webkit-progress-value {
			opacity: 1;
			border-radius: 6px;
		}

	}

	.disk-info {
		font-size: 0.875rem;
		line-height: 1.25rem;
		font-weight: 400;
		color: $grey-400;
	}
}
</style>

<style lang="scss" scoped>
.tag {
	font-size: 0.75rem;
	line-height: 1rem;
	font-weight: 400;
	height: 1.25rem;
	border-radius: 4px;
	padding-left: 0.375rem;
	padding-right: 0.375rem;
	border-width: 1px;
	border-style: solid;

	&.is-success {
		background-color: transparent;
		color: $green;
		border-color: $green;
	}

	&.is-danger {
		background-color: transparent;
		color: $red;
		border-color: $red;
	}

	&.is-light {
		background-color: transparent;
		color: $grey-400;
		border-color: $grey-400;
	}

}
</style>
