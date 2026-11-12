// What the dashboard asks of a box to draw its home page without one: the
// virtual machine module (in the shapes of CasaOS-VirtManagement's codegen
// HostOK, VMListOK and VMOK), the app grid (WebAppGridItem) and the few core
// calls the shell reads without a guard. A pure `handleGrid(request, state)`:
//
// request: { method, path, query, body }  ->  { status, body }, or null when the path is not one of these
// state:   newGridState()                   what was put in custom storage, and the images uploaded
//
// PUT /v2/virt_management/images/upload?name=<file>[&sha256=<hex>] takes the raw file as a Buffer. A file named
// after an error code (exists.iso, busy.iso, too_large.iso, ...) answers that code, so every refusal can be tried.
// An empty body answers 411 length_required once the name is good, as the module does to the dashboard's probe, and
// oldmodule.iso answers as a module older than the upload: 400 "no matching operation was found".
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { imageKind } from '../../src/components/VirtualMachines/vms.js'

const GIB = 1073741824
const ISO_FOLDER = '/DATA/VM/iso'
const UPLOAD_CODES = { bad_name: 400, bad_sha256: 400, incomplete: 400, too_long: 400, stalled: 408, exists: 409, length_required: 411, too_large: 413, checksum_mismatch: 422, bad_image: 422, busy: 503, insufficient_storage: 507 }
const QCOW2_MAGIC = Buffer.from([0x51, 0x46, 0x49, 0xFB])
const ISO_MAGIC = Buffer.from('CD001')

const HOST = {
	libvirt: 'available',
	libvirt_version: '9.0.0',
	kvm: true,
	uefi: true,
	cpus: 8,
	memory_mib: 16384,
	network: 'casaos',
	network_gateway: '10.8.0.1',
	network_subnet: '10.8.0.0/24',
	bridges: [],
	links: ['eth0'],
	storage_path: '/DATA/VM',
	storage_free_bytes: 500 * GIB,
}

function aVm({ id, name, title, state, os, ip }) {
	return {
		id,
		name,
		title,
		state,
		os,
		managed: true,
		console: true,
		vcpus: 2,
		memory_mib: 2048,
		firmware: 'uefi',
		pending_restart: false,
		network: { mode: 'casaos', name: 'casaos', casaos: true, fixed: true, ip, mac: '52:54:00:12:34:56' },
		disks: [{ target: 'vda', path: `/DATA/VM/${name}.qcow2`, managed: true, boot: true, capacity_bytes: 32 * GIB, allocation_bytes: 4 * GIB }],
		snapshots: [],
		ports: [],
		usb: [],
		cdrom: '',
	}
}

const VMS = [
	aVm({ id: '11111111-aaaa-4aaa-8aaa-111111111111', name: '1a2b3c4d', title: 'Debian', state: 'running', os: 'debian', ip: '10.8.0.10' }),
	aVm({ id: '22222222-bbbb-4bbb-8bbb-222222222222', name: '5e6f7a8b', title: 'Windows 11', state: 'shut-off', os: 'windows', ip: '10.8.0.11' }),
	aVm({ id: '33333333-cccc-4ccc-8ccc-333333333333', name: '9c0d1e2f', title: '<img src=x onerror=1>', state: 'paused', os: '', ip: '10.8.0.12' }),
]

function anApp(name, title, port, image) {
	return {
		name,
		title: { en_us: title },
		icon: '',
		status: 'running',
		app_type: 'v2app',
		author_type: 'by_casaos',
		compose_project: name,
		store_app_id: name,
		scheme: 'http',
		hostname: '',
		port,
		index: '/',
		image,
		is_uncontrolled: false,
		update_available: false,
	}
}

const APPS = [
	anApp('jellyfin', 'Jellyfin', '8096', 'linuxserver/jellyfin:latest'),
	anApp('nextcloud', 'Nextcloud', '10081', 'nextcloud:latest'),
	anApp('immich', 'Immich', '2283', 'ghcr.io/immich-app/immich-server:release'),
	anApp('plex', 'Plex', '32400', 'plexinc/pms-docker:latest'),
]

const UTILIZATION = {
	cpu: { percent: 12, num: 4, temperature: 45, model: 'stub', power: { timestamp: '0', value: '0' } },
	mem: { total: 8 * GIB, available: 5 * GIB, used: 3 * GIB, free: 5 * GIB, usedPercent: 37 },
	sys_disk: { avail: 200 * GIB, health: true, size: 256 * GIB, used: 56 * GIB },
	sys_usb: [],
	net: [{ name: 'eth0', bytesSent: 0, bytesRecv: 0, packetsSent: 0, packetsRecv: 0, time: 0 }],
}

// the core's envelope
const core = data => ({ status: 200, body: { success: 200, message: 'ok', data } })

const CORE_GETS = {
	'/v1/users/status': () => core({ initialized: true, key: '' }),
	'/v1/users/current': () => core({ id: 1, username: 'casaos', nickname: 'casaos', role: 'admin', avatar: '', description: '' }),
	'/v1/sys/version': () => core({ current_version: '0.4.15', need_update: false, version: { version: '0.4.15', change_log: '' } }),
	'/v1/sys/hardware': () => core({ drive_model: 'stub', arch: 'amd64' }),
	'/v1/sys/utilization': () => core(UTILIZATION),
	'/v1/sys/telemetry': () => core({ enabled: false }),
	'/v1/gateway/port': () => core('80'),
	'/v1/gateway/httpsport': () => core('443'),
	'/v1/usb/usb-auto-mount': () => core('False'),
	// a box alone with remote access on, which the public sharing goes through
	'/v1/fleet': () => core({ role: 'none', default_relay: 'https://relay.recasaos.org', remote: { relay: 'https://relay.recasaos.org', addr: '100.64.0.1', connected: true, error: '', alone: true } }),
	'/v1/fleet/remote': () => core({ devices: [], boxes: [] }),
}

const CUSTOM = /^\/v1\/users\/current\/custom\/([^/]+)$/
const ONE_VM = /^\/v2\/virt_management\/vms\/([^/]+)$/

export function newGridState() {
	return {
		custom: new Map(),
		images: [{ path: `${ISO_FOLDER}/alpine-virt-3.20.iso`, name: 'alpine-virt-3.20.iso', kind: 'iso', size_bytes: 64 * 1048576 }],
		share: { name: '', apps: new Set() },
	}
}

// /v1/share as the core answers it, on a box whose relay supports sharing: the tunnel is up once an app is shared
const SHARE_DOMAIN = 'box.recasaos.org'
const SHARE_APP = /^\/v1\/share\/apps\/([^/]+)$/

function shareStatus({ name, apps }) {
	const host = name ? `${name}.${SHARE_DOMAIN}` : ''
	return core({
		supported: true,
		reason: '',
		name,
		host,
		domain: SHARE_DOMAIN,
		tos_url: 'https://letsencrypt.org/repository/',
		apps: APPS.map(app => ({
			name: app.name,
			label: app.name,
			shared: apps.has(app.name),
			url: apps.has(app.name) ? `https://${app.name}.${host}` : '',
			port: app.port,
			scheme: app.scheme,
			error: '',
		})),
		cert: apps.size ? { not_after: new Date(Date.now() + 89 * 86400000).toISOString(), pending: false, error: '' } : { not_after: null, pending: false, error: '' },
		tunnel: { connected: apps.size > 0, error: '' },
	})
}

const shareRefused = message => ({ status: 400, body: { success: 400, message } })

function share(verb, path, body, state) {
	const box = state.share
	if (path === '/v1/share') {
		return verb === 'GET' ? shareStatus(box) : null
	}
	if (path === '/v1/share/name' && verb === 'PUT') {
		if (box.name) {
			return shareRefused('this box already has a public name')
		}
		if (!body?.accept_tos) {
			return shareRefused('the terms of service of Let\'s Encrypt must be accepted')
		}
		if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(body?.name || '')) {
			return shareRefused('a box name is 3 to 32 lowercase letters, digits or dashes, with no dash at either end')
		}
		box.name = body.name
		return shareStatus(box)
	}
	if (path === '/v1/share/apps' && verb === 'DELETE') {
		box.apps.clear()
		return shareStatus(box)
	}
	const one = path.match(SHARE_APP)
	if (one && (verb === 'PUT' || verb === 'DELETE')) {
		const name = decodeURIComponent(one[1])
		if (verb === 'PUT') {
			if (!box.name) {
				return shareRefused('choose the box\'s public name first')
			}
			box.apps.add(name)
		} else {
			box.apps.delete(name)
		}
		return shareStatus(box)
	}
	return null
}

const uploadFails = code => ({ status: UPLOAD_CODES[code], body: { message: code } })

function upload({ name = '', sha256 }, body, state) {
	const bytes = Buffer.isBuffer(body) ? body : Buffer.alloc(0)
	const stem = name.replace(/\.[^.]*$/, '')
	// a module older than the upload: its request validator knows no such route
	if (stem === 'oldmodule') {
		return { status: 400, body: { message: 'no matching operation was found' } }
	}
	if (Object.hasOwn(UPLOAD_CODES, stem)) {
		return uploadFails(stem)
	}
	const kind = imageKind(name)
	if (!kind || name.includes('/') || name.startsWith('.')) {
		return uploadFails('bad_name')
	}
	if (sha256 !== undefined && !/^[0-9a-f]{64}$/i.test(sha256)) {
		return uploadFails('bad_sha256')
	}
	// the dashboard's probe, an empty body, gets what the module answers it
	if (bytes.length === 0) {
		return uploadFails('length_required')
	}
	if (state.images.some(image => image.name.toLowerCase() === name.toLowerCase())) {
		return uploadFails('exists')
	}
	if (name.toLowerCase().endsWith('.qcow2') && !bytes.subarray(0, 4).equals(QCOW2_MAGIC)) {
		return uploadFails('bad_image')
	}
	const sum = createHash('sha256').update(bytes).digest('hex')
	if (sha256 && sha256.toLowerCase() !== sum) {
		return uploadFails('checksum_mismatch')
	}
	const image = { path: `${ISO_FOLDER}/${name}`, name, kind, size_bytes: bytes.length, sha256: sum }
	state.images.push({ path: image.path, name, kind, size_bytes: image.size_bytes })
	const bootable = bytes.subarray(32769, 32774).equals(ISO_MAGIC)
	return { status: 201, body: { data: kind === 'iso' && !bootable ? { ...image, warning: 'iso_signature_missing' } : image } }
}

export function handleGrid({ method = 'GET', path = '', query = {}, body = null } = {}, state = newGridState()) {
	const verb = method.toUpperCase()
	if (path === '/v2/virt_management/images/upload') {
		return verb === 'PUT' ? upload(query, body, state) : null
	}
	if (path.startsWith('/v1/share')) {
		return share(verb, path, body, state)
	}
	const custom = path.match(CUSTOM)
	if (custom) {
		const key = decodeURIComponent(custom[1])
		if (verb === 'POST') {
			state.custom.set(key, body)
			return core(body)
		}
		// what was never put is an empty string, as the core answers
		return verb === 'GET' ? core(state.custom.has(key) ? state.custom.get(key) : '') : null
	}
	if (verb === 'POST' && path === '/v1/users/login') {
		return core({
			token: {
				access_token: 'mock-access',
				refresh_token: 'mock-refresh',
				expires_at: 2000000000,
			},
			user: {
				id: 1,
				username: 'casaos',
				nickname: 'casaos',
				role: 'admin',
				avatar: '',
				description: '',
			},
		})
	}
	if (verb === 'POST' && path === '/v1/users/refresh') {
		return core({
			access_token: 'mock-access',
			refresh_token: 'mock-refresh',
			expires_at: 2000000000,
		})
	}
	// the gateway refuses the plain port, as it does a taken one
	if (verb === 'PUT' && path === '/v1/gateway/httpsport') {
		return body?.port === '80' ? { status: 200, body: { success: 400, message: 'port 80 is the web UI port' } } : core(body?.port ?? '')
	}
	if (verb !== 'GET') {
		return null
	}
	if (CORE_GETS[path]) {
		return CORE_GETS[path]()
	}
	switch (path) {
		case '/v2/virt_management/host':
			return { status: 200, body: { data: HOST } }
		case '/v2/virt_management/vms':
			return { status: 200, body: { data: VMS } }
		case '/v2/virt_management/images':
			return { status: 200, body: { data: state.images } }
		case '/v2/virt_management/images/downloads':
			return { status: 200, body: { data: [] } }
		case '/v2/app_management/web/appgrid':
			return { status: 200, body: { data: APPS } }
	}
	const one = path.match(ONE_VM)
	if (one) {
		const vm = VMS.find(candidate => candidate.id === decodeURIComponent(one[1]))
		return vm ? { status: 200, body: { data: vm } } : { status: 404, body: { message: 'vm not found' } }
	}
	return null
}
