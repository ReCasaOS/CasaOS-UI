// Pure helpers for the virtual machine page, kept out of the components so
// they can be tested without mounting anything.

export const STATES = {
	creating: 'creating',
	running: 'running',
	paused: 'paused',
	shuttingDown: 'shutting-down',
	shutOff: 'shut-off',
	crashed: 'crashed',
	suspended: 'suspended',
	unknown: 'unknown',
}

// The words shown for each state, as i18n keys.
const STATE_LABELS = {
	'creating': 'Creating…',
	'running': 'Running',
	'paused': 'Paused',
	'shutting-down': 'Shutting down…',
	'shut-off': 'Shut off',
	'crashed': 'Crashed',
	'suspended': 'Suspended',
	'unknown': 'Unknown',
}

export function stateLabel(state) {
	return Object.hasOwn(STATE_LABELS, state) ? STATE_LABELS[state] : STATE_LABELS.unknown
}

// Whether a state is one the service has a name for. One that comes by the
// message bus is anything its sender chose: it is not taken as it is.
export function isState(state) {
	return Object.values(STATES).includes(state)
}

// The dot next to the name: the app cards' classes (start/stop), plus one for
// states that are neither.
export function stateDot(state) {
	switch (state) {
		case STATES.running:
			return 'start'
		case STATES.paused:
		case STATES.shuttingDown:
		case STATES.creating:
		case STATES.suspended:
			return 'busy'
		default:
			return 'stop'
	}
}

// What can be done to a VM in a given state. Mirrors what libvirt accepts, so
// the menu never offers something the service would answer 409 to.
export function allowedActions(state) {
	const on = state === STATES.running || state === STATES.shuttingDown
	const off = state === STATES.shutOff || state === STATES.crashed
	const paused = state === STATES.paused

	return {
		start: off,
		shutdown: state === STATES.running,
		reboot: state === STATES.running,
		forceOff: on || paused || state === STATES.suspended,
		reset: state === STATES.running || paused,
		pause: state === STATES.running,
		resume: paused,
		console: state === STATES.running || paused,
		settings: state !== STATES.creating,
		cdrom: state !== STATES.creating,
		// deleting a running VM forces it off first; the dialog says so
		remove: state !== STATES.creating,
	}
}

// "." and ".." are dot segments: a browser takes them out of a route, as %2e
// too, so an id made of dots cannot be one segment of it, however it is encoded.
export function isDots(id) {
	return /^\.+$/.test(id)
}

// The service takes images from /DATA only, wherever the disks of the VMs go:
// what a folder under /media holds in its iso folder it refuses.
export function isUnderData(path) {
	return path === '/DATA' || (path || '').startsWith('/DATA/')
}

// Names the service accepts as images, by extension: an ISO goes in the CD-ROM,
// anything else is a disk image to import. Same list as the service's.
const DISK_EXTS = ['.qcow2', '.img', '.raw', '.vmdk', '.vdi']
const COMPRESSED_EXTS = ['.xz', '.gz']

export function imageKind(name) {
	const lower = (name || '').toLowerCase()

	if (lower.endsWith('.iso')) {
		return 'iso'
	}
	if (lower.endsWith('.zip')) {
		return 'disk'
	}
	for (const c of COMPRESSED_EXTS) {
		if (lower.endsWith(c)) {
			const inner = lower.slice(0, -c.length)
			return DISK_EXTS.some(ext => inner.endsWith(ext)) ? 'disk' : ''
		}
	}
	return DISK_EXTS.some(ext => lower.endsWith(ext)) ? 'disk' : ''
}

// A number in the viewer's words (15,41 in Italian). Without a locale it is
// written the English way, so the tests do not depend on the machine.
export function formatNumber(value, locale, digits = 0, minDigits = digits) {
	const tag = (locale || 'en').replace('_', '-')
	const options = { minimumFractionDigits: minDigits, maximumFractionDigits: digits }
	try {
		return value.toLocaleString(tag, options)
	} catch {
		return value.toLocaleString('en', options)
	}
}

export function formatBytes(bytes, locale) {
	if (bytes === undefined || bytes === null || Number.isNaN(bytes)) {
		return ''
	}
	const units = ['B', 'KB', 'MB', 'GB', 'TB']
	let value = bytes
	let unit = 0
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024
		unit++
	}
	return `${formatNumber(value, locale, value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

// Defaults for the create form, from what the host has: half the CPUs (at
// least one, at most four), 2 GiB of memory when the host can spare it.
export function createDefaults(host) {
	const cpus = host?.cpus || 1
	const memory = host?.memory_mib || 1024

	return {
		title: '',
		image_path: '',
		vcpus: Math.min(4, Math.max(1, Math.floor(cpus / 2))),
		memory_mib: memory >= 4096 ? 2048 : Math.max(512, Math.floor(memory / 4 / 128) * 128),
		disk_gib: 32,
		firmware: host?.uefi ? 'uefi' : 'bios',
		network: 'casaos',
		address: { mode: 'fixed', ip: '' },
		storage_path: host?.storage_path || '',
		os: '',
		start: true,
	}
}

// The networks a VM can be put on, as select options: the CasaOS network,
// the host's bridges, and macvtap on its wired cards. The value is what
// networkChoice turns into a request.
export function networkOptions(host) {
	return [
		{ value: 'casaos', label: `NAT (${host?.network || 'casaos'})` },
		...(host?.bridges || []).map(name => ({ value: `bridge:${name}`, label: `Bridge (${name})` })),
		...(host?.links || []).map(name => ({ value: `macvtap:${name}`, label: `macvtap (${name})` })),
	]
}

// The NetworkChoice for an option value.
export function networkChoice(value) {
	const [mode, source] = (value || 'casaos').split(':')
	return source ? { mode, source } : { mode }
}

// The option value for a VM's network; empty when CasaOS does not describe it.
export function networkValue(network) {
	switch (network?.mode) {
		case 'casaos':
			return 'casaos'
		case 'bridge':
		case 'macvtap':
			return `${network.mode}:${network.source}`
		default:
			return ''
	}
}

// How a VM's network reads, from its description.
export function networkLabel(network) {
	if (!network) {
		return '—'
	}
	switch (network.mode) {
		case 'casaos':
			return `NAT (${network.name})`
		case 'bridge':
			return `Bridge (${network.source})`
		case 'macvtap':
			return `macvtap (${network.source})`
		default:
			return network.type
	}
}

// What a network option means for the VM, as an i18n key.
export function networkHint(value) {
	switch (networkChoice(value).mode) {
		case 'bridge':
			return 'The VM is on the same network as the bridge, and gets its address from that network\'s router, like any other device. This machine, its containers and the LAN reach it at that address; it reaches the containers on their published ports at this machine\'s address.'
		case 'macvtap':
			return 'The VM sits directly on the network card and gets its address from the LAN\'s router. The LAN reaches it, but this machine and its containers cannot: use a bridge for that.'
		default:
			return 'The VM is on {subnet}, behind this machine. It reaches the internet, this machine, and the containers on their published ports at {gateway}; containers reach it at its address. Port forwards let the LAN reach it.'
	}
}

// Problems with a create form, as i18n keys; empty when it can be sent.
export function validateCreate(form, host) {
	const errors = {}

	if (!(form.title || '').trim()) {
		errors.title = 'Give the virtual machine a name.'
	}
	if (form.image_path && !imageKind(form.image_path)) {
		errors.image_path = 'Pick an ISO or a disk image (.qcow2, .img, .raw, .vmdk, .vdi, possibly .xz, .gz or .zip).'
	}
	if (!Number.isInteger(form.vcpus) || form.vcpus < 1 || (host?.cpus && form.vcpus > host.cpus)) {
		errors.vcpus = 'Between 1 and the number of CPUs of this machine.'
	}
	if (!Number.isInteger(form.memory_mib) || form.memory_mib < 256 || (host?.memory_mib && form.memory_mib > host.memory_mib)) {
		errors.memory_mib = 'Between 0.25 GB and the memory of this machine.'
	}
	if (!Number.isInteger(form.disk_gib) || form.disk_gib < 1) {
		errors.disk_gib = 'At least 1 GB.'
	}
	if ((form.network || 'casaos') === 'casaos' && form.address?.mode === 'fixed' && validateAddress(form.address.ip, host)) {
		errors.address = validateAddress(form.address.ip, host)
	}

	return errors
}

// The request body for POST /vms.
export function createRequest(form, host) {
	const body = {
		title: form.title.trim(),
		vcpus: form.vcpus,
		memory_mib: form.memory_mib,
		disk_gib: form.disk_gib,
		firmware: form.firmware,
		start: form.start,
	}
	if (form.network && form.network !== 'casaos') {
		body.network = networkChoice(form.network)
	} else if (form.address?.mode === 'dhcp') {
		body.network = { mode: 'casaos', address: 'dhcp' }
	} else if (form.address?.ip?.trim()) {
		body.network = { mode: 'casaos', address: form.address.ip.trim() }
	}
	if (form.os) {
		body.os = form.os
	}
	// the default folder needs no saying
	if (form.storage_path && form.storage_path !== host?.storage_path) {
		body.storage_path = form.storage_path
	}
	if (form.image_path) {
		body.image_path = form.image_path
	}
	return body
}

const byTitle = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// Sorts VMs by the order saved for the user; VMs not in it go last, by title,
// with numbers in titles compared as numbers ("VM 2" before "VM 10"). Returns
// the new order to save as well.
export function applyOrder(vms, savedOrder) {
	const ids = vms.map(vm => vm.id)
	const order = (savedOrder || []).filter(id => ids.includes(id))
	vms
		.filter(vm => !order.includes(vm.id))
		.sort((a, b) => byTitle.compare(a.title || '', b.title || ''))
		.forEach(vm => order.push(vm.id))

	const sorted = [...vms].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
	return { sorted, order }
}

// The fields of a settings form that differ from the VM, as a PATCH body.
export function updateRequest(vm, form) {
	const body = {}
	const title = (form.title || '').trim()
	if (title && title !== vm.title) {
		body.title = title
	}
	if (form.vcpus !== vm.vcpus) {
		body.vcpus = form.vcpus
	}
	if (form.memory_mib !== vm.memory_mib) {
		body.memory_mib = form.memory_mib
	}
	return body
}

// A disk's size in whole GiB, rounded up: the smallest size it can be
// grown from.
export function diskGiB(bytes) {
	return bytes ? Math.ceil(bytes / 1024 ** 3) : 0
}

// What can be done to one disk of a VM. The service changes only the disks of
// a VM CasaOS created, and grows only the files it created itself; a disk
// comes out of a VM that is off, and never the one it boots from.
export function diskActions(vm, disk) {
	const settled = [STATES.running, STATES.paused, STATES.shutOff, STATES.crashed].includes(vm.state)
	const off = vm.state === STATES.shutOff || vm.state === STATES.crashed

	return {
		resize: Boolean(vm.managed && disk.managed && settled && disk.capacity_bytes),
		remove: Boolean(vm.managed && settled && off && !disk.boot),
	}
}

// What Save will do to the disks: the settings modal takes note of each change
// and makes them all on Save, as it does with the name, CPU and memory.
//   grow:   { vdb: 64 }        target -> new size in GB
//   remove: { vdc: true }      target -> whether its file goes too
//   add:    [32, 8]            sizes in GB of the new disks
export function emptyDiskPlan() {
	return { grow: {}, remove: {}, add: [] }
}

export function diskPlanIsEmpty(plan) {
	return !Object.keys(plan.grow).length && !Object.keys(plan.remove).length && !plan.add.length
}

// The calls Save makes, in an order that cannot trip over itself: a removal
// first frees a target a new disk may take, and a disk being removed is not
// grown.
export function diskPlanSteps(plan) {
	const steps = []
	for (const [target, deleteFile] of Object.entries(plan.remove)) {
		steps.push({ kind: 'remove', target, deleteFile })
	}
	for (const [target, sizeGib] of Object.entries(plan.grow)) {
		if (!(target in plan.remove)) {
			steps.push({ kind: 'grow', target, sizeGib })
		}
	}
	for (const sizeGib of plan.add) {
		steps.push({ kind: 'add', sizeGib })
	}
	return steps
}

// The plan once a step is done: what is left for a Save that stopped halfway.
export function withoutStep(plan, step) {
	const next = { grow: { ...plan.grow }, remove: { ...plan.remove }, add: [...plan.add] }
	switch (step.kind) {
		case 'remove':
			delete next.remove[step.target]
			delete next.grow[step.target]
			break
		case 'grow':
			delete next.grow[step.target]
			break
		case 'add':
			next.add.splice(next.add.indexOf(step.sizeGib), 1)
			break
	}
	return next
}

// Port forwards: the host's port reaches the VM's. The settings note them and
// send the whole list on Save.

export function portLabel(port) {
	return `${port.protocol.toUpperCase()} ${port.host_port} → ${port.guest_port}`
}

export function samePorts(a, b) {
	const key = p => `${p.protocol}/${p.host_port}/${p.guest_port}`
	const left = (a || []).map(key).sort()
	const right = (b || []).map(key).sort()
	return left.length === right.length && left.every((k, i) => k === right[i])
}

// Problems with a forward about to be added, as an i18n key; empty when it can
// be. Whether the host port is free only the service can tell.
export function validatePort(port, list) {
	const inRange = n => Number.isInteger(n) && n >= 1 && n <= 65535
	if (!inRange(port.host_port) || !inRange(port.guest_port)) {
		return 'Ports go from 1 to 65535.'
	}
	if ((list || []).some(p => p.protocol === port.protocol && p.host_port === port.host_port)) {
		return 'This port of the machine is forwarded already.'
	}
	return ''
}

// Whether a disk can be added to a VM at all.
export function canAddDisk(vm) {
	return Boolean(vm.managed) && [STATES.running, STATES.paused, STATES.shutOff, STATES.crashed].includes(vm.state)
}

// X11 keysyms the console sends by name.
export const KEYSYM = {
	Tab: 0xFF09,
	Return: 0xFF0D,
	Escape: 0xFF1B,
	ShiftL: 0xFFE1,
	ControlL: 0xFFE3,
	AltL: 0xFFE9,
	SuperL: 0xFFEB,
}

// Characters typed with Shift on a US keyboard, the layout QEMU assumes.
const US_SHIFTED = '~!@#$%^&*()_+{}|:"<>?'

// The key presses that type text into a VM: each character's keysym, and
// whether Shift must be held for it. QEMU turns a keysym into the key that
// carries it and does not press Shift by itself, so an underscore sent alone
// arrives as a minus.
export function keysForText(text) {
	const keys = []
	for (const ch of text) {
		if (ch === '\r') {
			continue
		}
		if (ch === '\n') {
			keys.push({ keysym: KEYSYM.Return, shift: false })
			continue
		}
		if (ch === '\t') {
			keys.push({ keysym: KEYSYM.Tab, shift: false })
			continue
		}
		const code = ch.codePointAt(0)
		keys.push({
			keysym: code < 0x100 ? code : (0x01000000 | code),
			shift: (ch >= 'A' && ch <= 'Z') || US_SHIFTED.includes(ch),
		})
	}
	return keys
}

// What a VM runs, for its icon: the Material Design Icons the dashboard
// already has, in the colour of each system's own mark. The values are the
// service's.
export const OS_LIST = [
	{ value: '', label: 'Other', icon: 'monitor', color: '' },
	{ value: 'linux', label: 'Linux', icon: 'linux', color: '' },
	{ value: 'ubuntu', label: 'Ubuntu', icon: 'ubuntu', color: '#e95420' },
	{ value: 'debian', label: 'Debian', icon: 'debian', color: '#a81d33' },
	{ value: 'mint', label: 'Linux Mint', icon: 'linux-mint', color: '#6fa83b' },
	{ value: 'fedora', label: 'Fedora', icon: 'fedora', color: '#51a2da' },
	{ value: 'centos', label: 'CentOS', icon: 'centos', color: '#932279' },
	{ value: 'redhat', label: 'Red Hat', icon: 'redhat', color: '#ee0000' },
	{ value: 'arch', label: 'Arch Linux', icon: 'arch', color: '#1793d1' },
	{ value: 'alpine', label: 'Alpine Linux', icon: 'linux', color: '#0d597f' },
	{ value: 'opensuse', label: 'openSUSE', icon: 'linux', color: '#73ba25' },
	{ value: 'freebsd', label: 'FreeBSD', icon: 'freebsd', color: '#ab2b28' },
	{ value: 'windows', label: 'Windows', icon: 'microsoft-windows', color: '#0078d4' },
	{ value: 'homeassistant', label: 'Home Assistant', icon: 'home-assistant', color: '#18bcf2' },
	{ value: 'raspberry', label: 'Raspberry Pi OS', icon: 'raspberry-pi', color: '#c51a4a' },
]

export function osInfo(os) {
	return OS_LIST.find(o => o.value === (os || '')) || OS_LIST[0]
}

// Words in an image's file name that say what it installs, most specific
// first: "haos_ova-13.qcow2.xz" is Home Assistant, not a generic Linux.
const OS_HINTS = [
	[/haos|home.?assistant|hassos/, 'homeassistant'],
	[/win(dows)?[-_ .]?(1[01]|server|7|8)|^win|windows/, 'windows'],
	[/ubuntu|kubuntu|xubuntu|lubuntu/, 'ubuntu'],
	[/linuxmint|mint/, 'mint'],
	[/debian/, 'debian'],
	[/fedora/, 'fedora'],
	[/centos|rocky|alma/, 'centos'],
	[/rhel|redhat/, 'redhat'],
	[/archlinux|^arch/, 'arch'],
	[/alpine/, 'alpine'],
	[/opensuse|suse/, 'opensuse'],
	[/freebsd|pfsense|opnsense|truenas/, 'freebsd'],
	[/raspios|raspberry/, 'raspberry'],
]

// The OS an image's name suggests; empty when it says nothing.
export function guessOS(path) {
	const name = (path || '').split('/').pop().toLowerCase()
	for (const [pattern, os] of OS_HINTS) {
		if (pattern.test(name)) {
			return os
		}
	}
	return ''
}

// Memory is shown in GB and kept by the service in MiB.
export function mibToGB(mib) {
	return mib ? Math.round(mib / 1024 * 100) / 100 : 0
}

// Memory as people read it: MB below a gigabyte, else GB with up to two decimals.
export function formatMemory(mib, locale) {
	if (mib < 1024) {
		return `${formatNumber(mib || 0, locale)} MB`
	}
	return `${formatNumber(mibToGB(mib), locale, 2, 0)} GB`
}

export function gbToMib(gb) {
	return Math.round((gb || 0) * 1024)
}

// How a VM on the CasaOS network gets its address: 'fixed' with an address
// (empty: any free one), or 'dhcp'.
export function addressForm(network) {
	if (network?.casaos && !network.fixed) {
		return { mode: 'dhcp', ip: '' }
	}
	return { mode: 'fixed', ip: network?.fixed ? network.ip || '' : '' }
}

// The address shown in the VM list: whatever the service reports while the VM
// runs, and a fixed one on the CasaOS network while it is off too (stale:
// shown dimmed). Null when there is none to show.
export function listAddress(vm) {
	const ip = vm?.network?.ip
	if (!ip) {
		return null
	}
	if (vm.state === STATES.running) {
		return { ip, stale: false }
	}
	return vm.network.fixed ? { ip, stale: true } : null
}

// The address the service is asked for; undefined when nothing changes.
export function addressRequest(network, form) {
	const was = addressForm(network)
	if (form.mode === 'dhcp') {
		return was.mode === 'dhcp' && network?.casaos ? undefined : 'dhcp'
	}
	const ip = (form.ip || '').trim()
	if (network?.casaos && was.mode === 'fixed' && ip === was.ip) {
		return undefined
	}
	return ip
}

// A problem with a fixed address typed in, as an i18n key; empty when fine.
export function validateAddress(ip, host) {
	if (!ip) {
		return ''
	}
	const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip.trim())
	const prefix = (host?.network_subnet || '').split('/')[0].split('.').slice(0, 3).join('.')
	if (!m || m.slice(1).some(n => +n > 255) || `${m[1]}.${m[2]}.${m[3]}` !== prefix || +m[4] < 2 || +m[4] > 99) {
		return 'A fixed address goes from .2 to .99 of the network.'
	}
	return ''
}

// A snapshot's date, in the viewer's words. The dashboard names languages
// as it_it, which the browser only takes as it-IT.
export function formatDate(iso, locale) {
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) {
		return ''
	}
	const tag = (locale || '').replace('_', '-')
	const options = { dateStyle: 'medium', timeStyle: 'short' }
	try {
		return d.toLocaleString(tag || undefined, options)
	} catch {
		return d.toLocaleString(undefined, options)
	}
}

// A forward's identity in a list: protocol and both ports.
export function portKey(p) {
	return `${p.protocol}/${p.host_port}/${p.guest_port}`
}

// The rows of the USB tab: every device plugged into the host, and the VM's
// own that are unplugged now. attached: the VM has it; blocked: why it cannot
// be switched on (the host uses it, another VM has it), as an i18n key and
// its parameters.
export function usbRows(host, vm) {
	const mine = vm.usb || []
	const id = d => `${d.vendor}:${d.product}`
	const rows = (host || []).map((d) => {
		const attached = mine.some(m => id(m) === id(d))
		let blocked = null
		if (!attached && d.in_use) {
			blocked = { key: 'Used by this machine: {what}', params: { what: d.in_use } }
		} else if (!attached && d.vm_id && d.vm_id !== vm.id) {
			blocked = { key: 'Given to {vm}', params: { vm: d.vm_title || '' } }
		}
		return { id: id(d), vendor: d.vendor, product: d.product, name: d.name, attached, connected: true, blocked }
	})
	for (const m of mine) {
		if (!rows.some(r => r.id === id(m))) {
			rows.push({ id: id(m), vendor: m.vendor, product: m.product, name: m.name || id(m), attached: true, connected: false, blocked: null })
		}
	}
	return rows
}

// The list PUT /vms/{id}/usb takes once a row is switched.
export function usbRequest(vm, row, on) {
	const others = (vm.usb || [])
		.filter(m => `${m.vendor}:${m.product}` !== row.id)
		.map(m => ({ vendor: m.vendor, product: m.product }))
	return on ? [...others, { vendor: row.vendor, product: row.product }] : others
}

// How far a download is: a whole percent, or null when the server gave no
// size.
export function downloadProgress(d) {
	if (!d.total_bytes) {
		return { percent: null }
	}
	return { percent: Math.min(100, Math.floor(d.done_bytes / d.total_bytes * 100)) }
}

// The upload of an image from the browser.
//
// A refusal the service gives before reading the body (exists, too large, busy,
// no space) closes the connection, and a browser in the middle of a big file
// reports a network error instead of the code: what can be checked is checked
// before the file is sent.
export const UPLOAD_RESERVE_BYTES = 1024 ** 3

export function uploadRefusal(file, { sha256 = '', images = [], freeBytes } = {}) {
	const name = (file?.name || '').toLowerCase()
	if (!imageKind(name) || name.startsWith('.')) {
		return 'bad_name'
	}
	if (sha256 && !/^[0-9a-f]{64}$/i.test(sha256)) {
		return 'bad_sha256'
	}
	if (images.some(image => (image.name || '').toLowerCase() === name)) {
		return 'exists'
	}
	if (typeof freeBytes === 'number' && file.size + UPLOAD_RESERVE_BYTES > freeBytes) {
		return 'insufficient_storage'
	}
	return ''
}

// what the browser reports, as the dialog shows it: speed in bytes a second,
// time left in seconds, both null until there is something to measure
export function uploadProgress({ loaded, total }, startedAt, now) {
	const seconds = (now - startedAt) / 1000
	const speed = seconds > 0 && loaded > 0 ? loaded / seconds : null
	return {
		percent: total ? Math.min(100, Math.floor(loaded / total * 100)) : 0,
		loaded,
		total,
		speed,
		remaining: speed ? Math.max(0, Math.ceil((total - loaded) / speed)) : null,
	}
}

// The sentence of each code the service answers, and of what the dialog finds
// itself. The service's own text is never shown.
export const UPLOAD_ERRORS = {
	bad_name: 'This file is not an image virtual machines can use: an .iso, .qcow2, .img, .raw, .vmdk or .vdi, possibly in .xz, .gz or .zip.',
	bad_sha256: 'The SHA-256 is 64 hex digits.',
	incomplete: 'The file arrived incomplete. Try again.',
	too_long: 'The upload took too long and was stopped.',
	stalled: 'The upload stopped moving and was stopped. Check the connection and try again.',
	exists: 'An image with this name is already there. Rename the file, or pick the image in the list.',
	length_required: 'The browser did not give the size of the file. Try another browser.',
	too_large: 'This file is larger than the service accepts.',
	checksum_mismatch: 'The file does not match the SHA-256 given, and was deleted.',
	bad_image: 'This file is not a valid disk image.',
	busy: 'Two uploads are already running. Try again when one is over.',
	insufficient_storage: 'There is not enough free space for this file (1 GB is kept free).',
	network: 'The upload was refused or interrupted.',
	failed: 'The upload failed.',
	many: 'Drop one file at a time.',
}

// the code of a failed upload: one of UPLOAD_ERRORS
export function uploadErrorCode(e) {
	if (!e?.response) {
		return 'network'
	}
	const code = e.response.data?.message
	return typeof code === 'string' && Object.hasOwn(UPLOAD_ERRORS, code) && !['network', 'failed', 'many'].includes(code) ? code : 'failed'
}
