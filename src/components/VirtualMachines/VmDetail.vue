<template>
	<div class="vm-detail">
		<!-- who it is and what it does now -->
		<div class="detail-head">
			<os-icon :os="current.os" class="mr-3" size="lg" />
			<div class="is-flex-grow-1 head-text">
				<div class="is-flex is-align-items-center">
					<h4 class="title is-5 mb-0 mr-2 one-line" :title="current.title">{{ current.title }}</h4>
					<span :class="`state-badge state-${dot}`">{{ $t(label) }}</span>
				</div>
				<p class="is-size-7 has-text-full-03 one-line">
					{{ current.name }} · {{ current.vcpus }} vCPU · {{ formatMemory(current.memory_mib, $i18n.locale) }}
					<template v-if="current.network && current.network.ip"> · {{ current.network.ip }}</template>
				</p>
			</div>
			<b-button :disabled="!actions.console || busy" icon-left="console" size="is-small" type="is-primary"
				@click="$emit('action', 'console', current)">
				{{ $t('Console') }}
			</b-button>
		</div>

		<!-- power: the buttons the state allows, the rest in a menu -->
		<div class="power-bar">
			<b-button v-if="actions.start" :loading="busy" icon-left="play" size="is-small" class="power-btn is-go"
				@click="power('start')">{{ $t('Start') }}</b-button>
			<b-button v-if="actions.resume" :loading="busy" icon-left="play" size="is-small" class="power-btn is-go"
				@click="power('resume')">{{ $t('Resume') }}</b-button>
			<b-button v-if="actions.shutdown" :disabled="busy" icon-left="power" size="is-small" class="power-btn is-stop"
				@click="power('shutdown')">{{ $t('Shut down') }}</b-button>
			<b-button v-if="actions.reboot" :disabled="busy" icon-left="restart" size="is-small" class="power-btn is-restart"
				@click="power('reboot')">{{ $t('Restart') }}</b-button>
			<b-button v-if="actions.forceOff" :disabled="busy" icon-left="alert-outline" size="is-small"
				class="power-btn is-force" @click="power('force-off')">{{ $t('Force off') }}</b-button>

			<div class="ml-auto is-flex">
				<b-dropdown v-if="actions.pause || actions.reset" :mobile-modal="false" aria-role="list" position="is-bottom-left">
					<template #trigger>
						<b-button :disabled="busy" icon-left="dots-horizontal" size="is-small" :title="$t('More')" />
					</template>
					<b-dropdown-item v-if="actions.pause" aria-role="listitem" @click="power('pause')">{{ $t('Pause') }}</b-dropdown-item>
					<b-dropdown-item v-if="actions.reset" aria-role="listitem" class="has-text-danger" @click="power('reset')">
						{{ $t('Force reset') }}
					</b-dropdown-item>
				</b-dropdown>
				<!-- asks first: the delete dialog says what goes and what stays -->
				<b-button v-if="actions.remove" :disabled="busy" :title="$t('Delete')" icon-left="delete-outline"
					size="is-small" class="power-btn is-force ml-2" @click="$emit('action', 'delete', current)" />
			</div>
		</div>

		<b-message v-if="error" class="mb-3" size="is-small" type="is-danger">{{ error }}</b-message>

		<b-tabs v-model="tab" :animated="false" class="detail-tabs" size="is-small">
			<!-- General: the name, what it runs, CPU and memory -->
			<b-tab-item :label="$t('General')" value="general">
				<b-field :label="$t('Name')">
					<b-input v-model="form.title" :has-counter="false" maxlength="128"
						size="is-small"></b-input>
				</b-field>

				<os-field v-if="current.managed" v-model="form.os" class="mt-4" />

				<resources-fields v-model:memory-mib="form.memory_mib" v-model:vcpus="form.vcpus" :host="host" class="mt-3" />

				<p v-if="running && (form.vcpus !== current.vcpus || form.memory_mib !== current.memory_mib)"
					class="is-size-7 pending-note">
					{{ $t('CPU and memory changes take effect the next time the VM starts.') }}
				</p>

				<div class="columns is-mobile is-size-7 mt-2 facts">
					<div class="column">
						<p class="has-text-full-03">{{ $t('Firmware') }}</p>
						<p>{{ current.firmware === 'uefi' ? 'UEFI' : 'BIOS' }}</p>
					</div>
					<div class="column">
						<p class="has-text-full-03">{{ $t('Network') }}</p>
						<p>{{ networkLabel(current.network) }}<template v-if="current.network && current.network.ip"> · {{ current.network.ip }}</template></p>
					</div>
				</div>
			</b-tab-item>

			<!-- Storage: the disks, noted for Save, and the CD-ROM, at once -->
			<b-tab-item :label="$t('Storage & CD')" value="storage">
				<p class="label mb-1">{{ $t('Disks') }}</p>
				<div v-for="disk in current.disks || []" :key="disk.target" class="disk-row is-size-7">
					<div class="is-flex is-align-items-center">
						<div :class="{ 'is-removed': disk.target in plan.remove }" :title="disk.path" class="is-flex-grow-1 disk-info">
							<span class="has-text-weight-semibold">{{ disk.target }}</span>
							<span v-if="disk.boot" class="has-text-full-03"> · {{ $t('boot') }}</span>
							· {{ formatBytes(disk.capacity_bytes, $i18n.locale) }}
							<template v-if="plan.grow[disk.target] && !(disk.target in plan.remove)">
								→ <span class="has-text-weight-semibold">{{ plan.grow[disk.target] }} GB</span>
							</template>
							<span v-else-if="disk.allocation_bytes !== undefined" class="has-text-full-03">
								({{ $t('{size} used', { size: formatBytes(disk.allocation_bytes, $i18n.locale) }) }})
							</span>
						</div>

						<template v-if="disk.target in plan.remove || plan.grow[disk.target]">
							<span class="pending-note ml-1">
								{{ disk.target in plan.remove
									? (plan.remove[disk.target] ? $t('removed, file deleted') : $t('removed'))
									: $t('grown') }}
							</span>
							<b-button :disabled="saving" class="ml-1" size="is-small" @click="undoDisk(disk)">{{ $t('Undo') }}</b-button>
						</template>
						<template v-else>
							<b-button v-if="diskActions(current, disk).resize" :disabled="saving" class="ml-1" size="is-small"
								@click="openDisk(disk, 'resize')">{{ $t('Grow…') }}</b-button>
							<b-button v-if="!disk.boot && current.managed"
								:disabled="saving || !diskActions(current, disk).remove || hasSnapshots"
								:title="removeTitle(disk)" class="ml-1" size="is-small"
								@click="openDisk(disk, 'remove')">{{ $t('Remove…') }}</b-button>
						</template>
					</div>

					<div v-if="editing === disk.target && mode === 'resize'" class="disk-edit">
						<b-field :message="$t('The guest sees the larger disk; growing its partition is done inside the guest.')">
							<b-numberinput v-model="newSize" :min="diskGiB(disk.capacity_bytes) + 1" controls-position="compact"
								expanded size="is-small"></b-numberinput>
							<p class="control"><span class="button is-small is-static">GB</span></p>
						</b-field>
						<div class="is-flex is-justify-content-flex-end">
							<b-button class="mr-2" size="is-small" @click="editing = ''">{{ $t('Cancel') }}</b-button>
							<b-button :disabled="!(newSize > diskGiB(disk.capacity_bytes))" size="is-small" type="is-primary"
								@click="noteGrow(disk)">{{ $t('OK') }}</b-button>
						</div>
					</div>

					<div v-if="editing === disk.target && mode === 'remove'" class="disk-edit">
						<b-checkbox v-if="disk.managed" v-model="deleteFile" size="is-small">{{ $t('Also delete its file') }}</b-checkbox>
						<p class="has-text-full-03 mt-1">
							{{ deleteFile && disk.managed
								? $t('The disk and everything on it are deleted. This cannot be undone.')
								: $t('The file stays in place: you can keep it or delete it later with Files.') }}
						</p>
						<div class="is-flex is-justify-content-flex-end mt-2">
							<b-button class="mr-2" size="is-small" @click="editing = ''">{{ $t('Cancel') }}</b-button>
							<b-button size="is-small" type="is-danger" @click="noteRemove(disk)">{{ $t('Remove') }}</b-button>
						</div>
					</div>
				</div>

				<div v-for="(sizeGib, index) in plan.add" :key="`new-${index}`" class="disk-row is-size-7">
					<div class="is-flex is-align-items-center">
						<div class="is-flex-grow-1 disk-info">
							<span class="has-text-weight-semibold">{{ $t('new disk') }}</span> · {{ sizeGib }} GB
						</div>
						<span class="pending-note ml-1">{{ $t('added') }}</span>
						<b-button :disabled="saving" class="ml-1" size="is-small" @click="plan.add.splice(index, 1)">{{ $t('Undo') }}</b-button>
					</div>
				</div>

				<b-field v-if="canAddDisk(current)" class="mt-2" :message="addMessage">
					<b-numberinput v-model="addSize" :disabled="hasSnapshots" :min="1" controls-position="compact" expanded
						size="is-small"></b-numberinput>
					<p class="control"><span class="button is-small is-static">GB</span></p>
					<p class="control">
						<b-button :disabled="!(addSize >= 1) || saving || hasSnapshots" size="is-small" @click="plan.add.push(addSize)">
							{{ $t('Add disk') }}
						</b-button>
					</p>
				</b-field>

				<p v-if="!diskPlanIsEmpty(plan)" class="is-size-7 pending-note mt-2">{{ $t('Disk changes are made when you save.') }}</p>

				<b-field :label="$t('CD-ROM')" :message="$t('Inserting or ejecting a disc takes effect at once.')" class="mt-5">
					<b-select :model-value="current.cdrom || ''" :disabled="cdBusy" expanded size="is-small"
						@update:model-value="setCD">
						<option value="">{{ $t('Empty') }}</option>
						<option v-for="iso in isoChoices" :key="iso" :value="iso">{{ iso.split('/').pop() }}</option>
					</b-select>
					<p class="control">
						<b-button :loading="cdBusy" size="is-small" @click="browseISO">{{ $t('Browse…') }}</b-button>
					</p>
					<p class="control">
						<b-button icon-left="download" size="is-small" :title="$t('Download from a URL')" @click="downloadISO" />
					</p>
				</b-field>
			</b-tab-item>

			<!-- Network: where the card goes, its address, the forwards -->
			<b-tab-item :label="$t('Network & ports')" value="network">
				<template v-if="current.network && current.managed">
					<network-field v-model="network" v-model:address="address" :disabled="saving" :host="host" :options="networks" />

					<p v-if="networkChanged" class="is-size-7 pending-note mt-2">
						{{ networkModeChanged && running ? $t('The network changes at the next start.') : $t('The network changes when you save.') }}
						<template v-if="dropsPorts">{{ $t('Its port forwards are removed.') }}</template>
					</p>
				</template>
				<p v-else class="is-size-7 has-text-full-03">{{ networkLabel(current.network) }}</p>

				<template v-if="showPorts">
					<p class="label mt-5 mb-1">{{ $t('Port forwards') }}</p>
					<p class="is-size-7 has-text-full-03 mb-1">
						{{ $t('Containers reach this VM at {ip}; it reaches them at {gateway} on their published ports. A forward lets the LAN reach it at {address}:<port of this machine>.', { ip: current.network.ip || '', gateway: host.network_gateway || '', address: boxAddress }) }}
					</p>

					<div v-for="port in current.ports || []" :key="portKey(port)" class="disk-row is-size-7">
						<div class="is-flex is-align-items-center">
							<div :class="{ 'is-removed': removedPorts.includes(portKey(port)) }" class="is-flex-grow-1">{{ portLabel(port) }}</div>
							<template v-if="removedPorts.includes(portKey(port))">
								<span class="pending-note ml-1">{{ $t('removed') }}</span>
								<b-button :disabled="saving" class="ml-1" size="is-small"
									@click="removedPorts = removedPorts.filter(k => k !== portKey(port))">{{ $t('Undo') }}</b-button>
							</template>
							<b-button v-else :disabled="saving" class="ml-1" size="is-small" @click="removedPorts.push(portKey(port))">
								{{ $t('Remove') }}
							</b-button>
						</div>
					</div>
					<div v-for="(port, index) in addedPorts" :key="`new-port-${index}`" class="disk-row is-size-7">
						<div class="is-flex is-align-items-center">
							<div class="is-flex-grow-1">{{ portLabel(port) }}</div>
							<span class="pending-note ml-1">{{ $t('added') }}</span>
							<b-button :disabled="saving" class="ml-1" size="is-small" @click="addedPorts.splice(index, 1)">{{ $t('Undo') }}</b-button>
						</div>
					</div>

					<b-field :message="portError ? $t(portError) : ''" :type="portError ? 'is-danger' : ''" class="mt-2">
						<b-select v-model="newPort.protocol" size="is-small">
							<option value="tcp">TCP</option>
							<option value="udp">UDP</option>
						</b-select>
						<b-input v-model.number="newPort.host_port" :placeholder="$t('this machine')" expanded size="is-small"
							type="number"></b-input>
						<p class="control"><span class="button is-small is-static">→</span></p>
						<b-input v-model.number="newPort.guest_port" :placeholder="$t('VM')" expanded size="is-small"
							type="number"></b-input>
						<p class="control">
							<b-button :disabled="saving" size="is-small" @click="addPort">{{ $t('Add') }}</b-button>
						</p>
					</b-field>

					<p v-if="portsChanged" class="is-size-7 pending-note">{{ $t('Port forwards change when you save.') }}</p>
				</template>
			</b-tab-item>

			<!-- USB: the host's devices, given and taken back at once -->
			<b-tab-item v-if="current.managed" :label="$t('USB')" value="usb">
				<div class="is-flex is-align-items-center mb-3">
					<p class="is-size-7 has-text-full-03 is-flex-grow-1">
						{{ $t('A device given to the VM leaves this machine while the VM runs, and comes back when it stops. It stays the VM\'s when unplugged and plugged in again.') }}
					</p>
					<b-button :loading="usbLoading" class="ml-2" icon-left="refresh" size="is-small" :title="$t('Refresh')" @click="loadUSB" />
				</div>

				<div v-for="row in usbRows" :key="row.id" class="disk-row is-size-7">
					<div class="is-flex is-align-items-center">
						<b-icon class="mr-2 has-text-full-03" icon="usb" size="is-small" />
						<div class="is-flex-grow-1 disk-info">
							<span class="has-text-weight-semibold">{{ row.name }}</span>
							<span class="has-text-full-03"> · {{ row.id }}</span>
							<span v-if="!row.connected" class="pending-note"> · {{ $t('not plugged in') }}</span>
							<p v-if="row.blocked" class="has-text-full-03">{{ $t(row.blocked.key, row.blocked.params) }}</p>
						</div>
						<b-switch :disabled="!!row.blocked || usbBusy" :model-value="row.attached" size="is-small"
							@update:model-value="setUSB(row, $event)" />
					</div>
				</div>
				<p v-if="!usbLoading && !usbRows.length" class="is-size-7 has-text-full-03">{{ $t('No USB devices are plugged into this machine.') }}</p>
			</b-tab-item>

			<!-- Snapshots: taken and restored with the VM off, at once -->
			<b-tab-item v-if="current.managed" :label="$t('Snapshots')" value="snapshots">
				<p class="is-size-7 has-text-full-03 mb-3">
					{{ $t('A snapshot keeps the disks and the firmware settings as they are, to go back to later. It is taken and restored with the VM off, and does not keep what was in memory.') }}
				</p>

				<div v-for="snap in snapshotsNewestFirst" :key="snap.id" class="disk-row is-size-7">
					<div class="is-flex is-align-items-center">
						<b-icon class="mr-2 has-text-full-03" icon="camera-outline" size="is-small" />
						<div class="is-flex-grow-1 disk-info">
							<span class="has-text-weight-semibold">{{ snap.name }}</span>
							<span class="has-text-full-03"> · {{ formatDate(snap.created_at, $i18n.locale) }}</span>
						</div>
						<b-button :disabled="!off || snapBusy" class="ml-1" size="is-small" @click="revertSnapshot(snap)">
							{{ $t('Go back') }}
						</b-button>
						<b-button :disabled="!off || snapBusy" class="ml-1 power-btn is-force" size="is-small"
							@click="deleteSnapshot(snap)">{{ $t('Delete') }}</b-button>
					</div>
				</div>
				<p v-if="!(current.snapshots || []).length" class="is-size-7 has-text-full-03">{{ $t('No snapshots yet.') }}</p>

				<b-field :message="off ? '' : $t('Shut the VM down to take a snapshot.')" class="mt-3">
					<b-input v-model="snapName" :disabled="!off || snapBusy" :placeholder="$t('Snapshot name')" expanded
						maxlength="128" :has-counter="false" size="is-small" @keyup.enter="takeSnapshot"></b-input>
					<p class="control">
						<b-button :disabled="!off || !snapName.trim()" :loading="snapBusy" icon-left="camera-outline"
							size="is-small" type="is-primary" @click="takeSnapshot">{{ $t('Take snapshot') }}</b-button>
					</p>
				</b-field>
			</b-tab-item>
		</b-tabs>

		<p v-if="running && current.pending_restart" class="is-size-7 pending-note">
			{{ $t('Some changes take effect the next time the VM starts.') }}
		</p>

		<div v-if="tab !== 'snapshots' && tab !== 'usb'" class="detail-foot">
			<b-button :disabled="!changed || saving" class="mr-2" rounded size="is-small" @click="reset">{{ $t('Undo changes') }}</b-button>
			<b-button :disabled="!changed || !!addressError" :loading="saving" rounded size="is-small" type="is-primary"
				@click="save">{{ $t('Save') }}</b-button>
		</div>
	</div>
</template>

<script>
import DownloadModal from './DownloadModal.vue'
import NetworkField from './NetworkField.vue'
import OsField from './OsField.vue'
import OsIcon from './OsIcon.vue'
import PathPicker from './PathPicker.vue'
import ResourcesFields from './ResourcesFields.vue'
import vmApi from './api'
import {
	addressForm,
	addressRequest,
	allowedActions,
	canAddDisk,
	diskActions,
	diskGiB,
	diskPlanIsEmpty,
	diskPlanSteps,
	emptyDiskPlan,
	formatBytes,
	formatDate,
	formatMemory,
	isUnderData,
	networkChoice,
	networkLabel,
	networkOptions,
	networkValue,
	portKey,
	portLabel,
	samePorts,
	stateDot,
	stateLabel,
	updateRequest,
	usbRequest,
	usbRows,
	validateAddress,
	validatePort,
	withoutStep,
} from './vms'

export default {
	name: 'VmDetail',
	components: { NetworkField, OsField, OsIcon, ResourcesFields },
	props: {
		vm: { type: Object, required: true },
		host: { type: Object, required: true },
		images: { type: Array, default: () => [] },
		// a power action on this VM is on its way
		busy: { type: Boolean, default: false },
	},
	// power, console and delete go to the page; changes to the VM come back
	// through updated
	emits: ['action', 'updated', 'imagesChanged'],
	data() {
		return {
			tab: 'general',
			form: this.formOf(this.vm),
			saving: false,
			cdBusy: false,
			snapBusy: false,
			hostUSB: [],
			usbLoading: false,
			usbBusy: false,
			error: '',
			plan: emptyDiskPlan(),
			editing: '',
			mode: '',
			newSize: 0,
			deleteFile: false,
			addSize: 32,
			network: networkValue(this.vm.network),
			address: addressForm(this.vm.network),
			removedPorts: [],
			addedPorts: [],
			newPort: { protocol: 'tcp', host_port: null, guest_port: null },
			portError: '',
			snapName: '',
		}
	},
	computed: {
		// the VM as the service last described it
		current() {
			return this.vm
		},
		actions() {
			return allowedActions(this.current.state)
		},
		dot() {
			return stateDot(this.current.state)
		},
		label() {
			return stateLabel(this.current.state)
		},
		running() {
			return this.current.state !== 'shut-off' && this.current.state !== 'crashed'
		},
		off() {
			return !this.running
		},
		hasSnapshots() {
			return (this.current.snapshots || []).length > 0
		},
		usbRows() {
			return usbRows(this.hostUSB, this.current)
		},
		snapshotsNewestFirst() {
			return [...(this.current.snapshots || [])].reverse()
		},
		networks() {
			const options = networkOptions(this.host)
			const value = networkValue(this.current.network)
			if (!options.some(o => o.value === value)) {
				options.unshift({ value, label: networkLabel(this.current.network) })
			}
			return options
		},
		networkModeChanged() {
			return this.network !== networkValue(this.current.network)
		},
		addressChange() {
			return this.network === 'casaos' ? addressRequest(this.current.network, this.address) : undefined
		},
		networkChanged() {
			return this.networkModeChanged || this.addressChange !== undefined
		},
		addressError() {
			return this.network === 'casaos' && this.address.mode === 'fixed' ? validateAddress(this.address.ip, this.host) : ''
		},
		// forwards need the CasaOS network and a fixed address, now and after Save
		showPorts() {
			return Boolean(this.current.network?.casaos && this.current.network?.fixed && this.network === 'casaos' && this.address.mode === 'fixed')
		},
		dropsPorts() {
			return (this.current.ports || []).length > 0 && (this.network !== 'casaos' || this.address.mode === 'dhcp')
		},
		ports() {
			return (this.current.ports || [])
				.filter(p => !this.removedPorts.includes(portKey(p)))
				.concat(this.addedPorts)
		},
		portsChanged() {
			return !samePorts(this.ports, this.current.ports)
		},
		osChanged() {
			return this.current.managed && this.form.os !== (this.current.os || '')
		},
		changed() {
			return Object.keys(updateRequest(this.current, this.form)).length > 0 || this.osChanged
				|| !diskPlanIsEmpty(this.plan) || this.networkChanged || (this.showPorts && this.portsChanged)
		},
		isoChoices() {
			const isos = this.images.filter(img => img.kind === 'iso' && isUnderData(img.path)).map(img => img.path)
			if (this.current.cdrom && !isos.includes(this.current.cdrom)) {
				isos.unshift(this.current.cdrom)
			}
			return isos
		},
		boxAddress() {
			return window.location.hostname
		},
		addMessage() {
			if (this.hasSnapshots) {
				return this.$t('Delete the snapshots to add or remove disks.')
			}
			return this.running ? this.$t('On Save a new disk goes into the running VM when it can take it, otherwise at its next start.') : ''
		},
	},
	watch: {
		tab(tab) {
			if (tab === 'usb') {
				this.loadUSB()
			}
		},
	},
	methods: {
		async loadUSB() {
			this.usbLoading = true
			try {
				const res = await vmApi.hostUSB()
				this.hostUSB = res.data.data || []
			} catch (e) {
				this.error = e.response?.data?.message || e.message
			} finally {
				this.usbLoading = false
			}
		},
		async setUSB(row, on) {
			this.usbBusy = true
			this.error = ''
			try {
				const res = await vmApi.setUSB(this.current.id, usbRequest(this.current, row, on))
				this.show(res.data.data)
			} catch (e) {
				this.error = e.response?.data?.message || e.message
			} finally {
				this.usbBusy = false
				this.loadUSB()
			}
		},
		formatBytes,
		formatDate,
		formatMemory,
		diskGiB,
		diskActions,
		diskPlanIsEmpty,
		canAddDisk,
		networkLabel,
		portLabel,
		portKey,
		formOf(vm) {
			return { title: vm.title, vcpus: vm.vcpus, memory_mib: vm.memory_mib, os: vm.os || '' }
		},
		// back to the VM as it is: every change noted is dropped
		reset() {
			this.form = this.formOf(this.current)
			this.plan = emptyDiskPlan()
			this.editing = ''
			this.network = networkValue(this.current.network)
			this.address = addressForm(this.current.network)
			this.removedPorts = []
			this.addedPorts = []
			this.portError = ''
			this.error = ''
		},
		show(vm) {
			this.$emit('updated', vm)
		},
		removeTitle(disk) {
			if (this.hasSnapshots) {
				return this.$t('Delete the snapshots to add or remove disks.')
			}
			return diskActions(this.current, disk).remove ? '' : this.$t('Shut the VM down first.')
		},
		power(action) {
			this.$emit('action', action, this.current)
		},
		addPort() {
			const port = { ...this.newPort }
			this.portError = validatePort(port, this.ports)
			if (this.portError) {
				return
			}
			this.addedPorts.push(port)
			this.newPort = { protocol: port.protocol, host_port: null, guest_port: null }
		},
		openDisk(disk, mode) {
			this.editing = disk.target
			this.mode = mode
			this.newSize = this.plan.grow[disk.target] || diskGiB(disk.capacity_bytes) + 1
			this.deleteFile = false
		},
		noteGrow(disk) {
			this.plan.grow[disk.target] = this.newSize
			this.editing = ''
		},
		noteRemove(disk) {
			this.plan.remove[disk.target] = this.deleteFile && disk.managed
			this.editing = ''
		},
		undoDisk(disk) {
			delete this.plan.remove[disk.target]
			delete this.plan.grow[disk.target]
		},
		runStep(step) {
			switch (step.kind) {
				case 'remove':
					return vmApi.removeDisk(this.current.id, step.target, step.deleteFile)
				case 'grow':
					return vmApi.resizeDisk(this.current.id, step.target, step.sizeGib)
				default:
					return vmApi.addDisk(this.current.id, step.sizeGib)
			}
		},
		// The name, what it runs, CPU, memory and network first, then the disks
		// one by one, then the forwards. When a call fails the changes still to
		// make stay noted, with the VM as the calls that went through left it.
		async save() {
			this.saving = true
			this.error = ''
			try {
				const body = updateRequest(this.current, this.form)
				if (this.osChanged) {
					body.os = this.form.os
				}
				if (this.networkChanged) {
					body.network = networkChoice(this.network)
					if (this.addressChange !== undefined) {
						body.network.address = this.addressChange
					}
				}
				if (Object.keys(body).length) {
					const res = await vmApi.update(this.current.id, body)
					this.show(res.data.data)
					this.network = networkValue(res.data.data.network)
					this.address = addressForm(res.data.data.network)
				}
				for (const step of diskPlanSteps(this.plan)) {
					const res = await this.runStep(step)
					this.show(res.data.data)
					this.plan = withoutStep(this.plan, step)
				}
				if (this.portsChanged && this.showPorts) {
					const res = await vmApi.setPorts(this.current.id, this.ports)
					this.show(res.data.data)
				}
				this.removedPorts = []
				this.addedPorts = []
			} catch (e) {
				this.error = e.response?.data?.message || e.message
			} finally {
				this.saving = false
			}
		},
		browseISO() {
			const modal = this.$buefy.modal.open({
				component: PathPicker,
				hasModalCard: true,
				trapFocus: true,
				props: { isoOnly: true },
				events: {
					select: (path) => {
						modal.close()
						this.setCD(path)
					},
				},
			})
		},
		downloadISO() {
			const modal = this.$buefy.modal.open({
				component: DownloadModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				props: { isoOnly: true, folder: `${this.host.storage_path || '/DATA/VM'}/iso` },
				events: {
					select: (path) => {
						modal.close()
						this.setCD(path)
						this.$emit('imagesChanged')
					},
				},
			})
		},
		async setCD(path) {
			this.cdBusy = true
			this.error = ''
			try {
				const res = await vmApi.setCDROM(this.current.id, path)
				this.show(res.data.data)
			} catch (e) {
				this.error = e.response?.data?.message || e.message
			} finally {
				this.cdBusy = false
			}
		},
		async snapshotCall(call) {
			this.snapBusy = true
			this.error = ''
			try {
				const res = await call()
				this.show(res.data.data)
				return true
			} catch (e) {
				this.error = e.response?.data?.message || e.message
				return false
			} finally {
				this.snapBusy = false
			}
		},
		async takeSnapshot() {
			const name = this.snapName.trim()
			if (!name || !this.off) {
				return
			}
			if (await this.snapshotCall(() => vmApi.createSnapshot(this.current.id, name))) {
				this.snapName = ''
			}
		},
		revertSnapshot(snap) {
			this.$buefy.dialog.confirm({
				title: this.$t('Go back to {name}?', { name: snap.name }),
				message: this.$t('The disks and firmware settings go back to how they were then. Whatever changed since is lost; the snapshot stays.'),
				confirmText: this.$t('Go back'),
				cancelText: this.$t('Cancel'),
				type: 'is-warning',
				onConfirm: () => this.snapshotCall(() => vmApi.revertSnapshot(this.current.id, snap.id)),
			})
		},
		deleteSnapshot(snap) {
			this.$buefy.dialog.confirm({
				title: this.$t('Delete {name}?', { name: snap.name }),
				message: this.$t('The VM stays as it is; only the saved state goes.'),
				confirmText: this.$t('Delete'),
				cancelText: this.$t('Cancel'),
				type: 'is-danger',
				onConfirm: () => this.snapshotCall(() => vmApi.deleteSnapshot(this.current.id, snap.id)),
			})
		},
	},
}
</script>

<style lang="scss" scoped>
.vm-detail {
	display: flex;
	flex-direction: column;
	min-width: 0;
	min-height: 100%;

	.detail-head {
		display: flex;
		align-items: center;
		margin-bottom: 0.75rem;

		.head-text {
			min-width: 0;
		}

		.title {
			color: var(--casa-text-strong);
		}
	}

	.power-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem;
		margin-bottom: 0.75rem;
		border-radius: 0.5rem;
		background: var(--casa-surface-sunken);
	}

	// tinted like the mockup, in both themes
	.power-btn {
		border: none;
		font-weight: 500;

		&.is-go {
			color: #1f9d4c;
			background: rgba(61, 210, 107, 0.16);
		}

		&.is-stop {
			color: #d9480f;
			background: rgba(229, 72, 77, 0.14);
		}

		&.is-restart {
			color: #b86e00;
			background: rgba(245, 166, 35, 0.16);
		}

		&.is-force {
			color: #e5484d;
			background: rgba(229, 72, 77, 0.2);
		}

		&:hover {
			filter: brightness(0.95);
		}
	}

	.state-badge {
		flex-shrink: 0;
		padding: 0.05rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		color: var(--casa-text-dim);
		background: var(--casa-surface-sunken);

		&.state-start {
			color: #1f9d4c;
			background: rgba(61, 210, 107, 0.15);
		}

		&.state-busy {
			color: #b86e00;
			background: rgba(245, 166, 35, 0.15);
		}
	}

	.detail-tabs {
		flex-grow: 1;

		:deep(.tab-content) {
			padding: 1rem 0.25rem 0.5rem;
		}
	}

	.detail-foot {
		display: flex;
		justify-content: flex-end;
		padding-top: 0.75rem;
		margin-top: auto;
		border-top: 1px solid var(--casa-border);
	}

	.one-line {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	// the warning yellow is unreadable on a light card
	.pending-note {
		color: #a15c00;
	}

	.disk-row {
		padding: 0.375rem 0;
		border-bottom: 1px solid var(--casa-border);
	}

	.disk-info {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.disk-edit {
		margin-top: 0.5rem;
	}

	.is-removed {
		text-decoration: line-through;
		opacity: 0.6;
	}
}
</style>
