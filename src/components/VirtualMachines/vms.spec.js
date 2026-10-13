import { describe, expect, it } from 'vitest'
import {
	KEYSYM,
	addressForm,
	addressRequest,
	allowedActions,
	applyOrder,
	canAddDisk,
	createDefaults,
	createRequest,
	diskActions,
	diskGiB,
	diskPlanIsEmpty,
	diskPlanSteps,
	downloadProgress,
	emptyDiskPlan,
	formatBytes,
	formatDate,
	gbToMib,
	guessOS,
	imageKind,
	keysForText,
	listAddress,
	mibToGB,
	networkChoice,
	networkLabel,
	networkOptions,
	networkValue,
	osInfo,
	portLabel,
	samePorts,
	stateDot,
	stateLabel,
	updateRequest,
	usbRequest,
	usbRows,
	validateAddress,
	validateCreate,
	validatePort,
	withoutStep,
} from './vms'

describe('stateDot and stateLabel', () => {
	it('shows running as the apps do, and in-between states apart', () => {
		expect(stateDot('running')).toBe('start')
		expect(stateDot('shut-off')).toBe('stop')
		expect(stateDot('crashed')).toBe('stop')
		expect(stateDot('paused')).toBe('busy')
		expect(stateDot('creating')).toBe('busy')
	})

	it('falls back to Unknown', () => {
		expect(stateLabel('running')).toBe('Running')
		expect(stateLabel('what')).toBe('Unknown')
	})
})

describe('allowedActions', () => {
	it('offers start only when the VM is off', () => {
		expect(allowedActions('shut-off').start).toBe(true)
		expect(allowedActions('crashed').start).toBe(true)
		expect(allowedActions('running').start).toBe(false)
		expect(allowedActions('paused').start).toBe(false)
	})

	it('offers the console while the VM has a display', () => {
		expect(allowedActions('running').console).toBe(true)
		expect(allowedActions('paused').console).toBe(true)
		expect(allowedActions('shut-off').console).toBe(false)
	})

	it('pauses a running VM and resumes a paused one', () => {
		expect(allowedActions('running')).toMatchObject({ pause: true, resume: false })
		expect(allowedActions('paused')).toMatchObject({ pause: false, resume: true, forceOff: true })
	})

	it('offers nothing but waiting while the disk is imported', () => {
		const a = allowedActions('creating')
		expect(Object.values(a).some(Boolean)).toBe(false)
	})
})

describe('imageKind', () => {
	it.each([
		['alpine.iso', 'iso'],
		['WIN11.ISO', 'iso'],
		['haos_ova-16.2.qcow2.xz', 'disk'],
		['disk.img.gz', 'disk'],
		['bundle.zip', 'disk'],
		['disk.vmdk', 'disk'],
		['notes.txt', ''],
		['archive.tar.gz', ''],
		['', ''],
	])('%s is %s', (name, kind) => {
		expect(imageKind(name)).toBe(kind)
	})
})

describe('formatBytes', () => {
	it('picks a unit', () => {
		expect(formatBytes(0)).toBe('0 B')
		expect(formatBytes(1536)).toBe('1.5 KB')
		expect(formatBytes(69206016)).toBe('66 MB')
		expect(formatBytes(2 * 1024 ** 3)).toBe('2.0 GB')
		expect(formatBytes(undefined)).toBe('')
	})
})

describe('createDefaults', () => {
	it('fits the host', () => {
		expect(createDefaults({ cpus: 2, memory_mib: 3330, uefi: true })).toMatchObject({ vcpus: 1, memory_mib: 768, firmware: 'uefi' })
		expect(createDefaults({ cpus: 16, memory_mib: 32768, uefi: false })).toMatchObject({ vcpus: 4, memory_mib: 2048, firmware: 'bios' })
		expect(createDefaults(undefined)).toMatchObject({ vcpus: 1, memory_mib: 512 })
	})
})

describe('validateCreate', () => {
	const host = { cpus: 2, memory_mib: 3330 }
	const ok = { title: 'x', image_path: '/DATA/VM/iso/a.iso', vcpus: 1, memory_mib: 512, disk_gib: 2 }

	it('accepts a sound form', () => {
		expect(validateCreate(ok, host)).toEqual({})
		expect(validateCreate({ ...ok, image_path: '' }, host)).toEqual({})
	})

	it('names each field that is wrong', () => {
		const errors = validateCreate({ title: ' ', image_path: '/DATA/a.txt', vcpus: 3, memory_mib: 99999, disk_gib: 0 }, host)
		expect(Object.keys(errors).sort()).toEqual(['disk_gib', 'image_path', 'memory_mib', 'title', 'vcpus'])
	})
})

describe('createRequest', () => {
	it('trims the title and leaves out an empty image', () => {
		const body = createRequest({ title: ' Alpine ', image_path: '', vcpus: 1, memory_mib: 512, disk_gib: 2, firmware: 'uefi', start: true })
		expect(body).toEqual({ title: 'Alpine', vcpus: 1, memory_mib: 512, disk_gib: 2, firmware: 'uefi', start: true })
	})
})

describe('applyOrder', () => {
	const vms = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

	it('keeps the saved order, drops deleted VMs, appends new ones', () => {
		const { sorted, order } = applyOrder(vms, ['c', 'gone', 'a'])
		expect(sorted.map(v => v.id)).toEqual(['c', 'a', 'b'])
		expect(order).toEqual(['c', 'a', 'b'])
	})

	it('works without a saved order', () => {
		expect(applyOrder(vms, null).order).toEqual(['a', 'b', 'c'])
	})

	it('puts VMs with no saved place in natural title order', () => {
		const titled = [{ id: 'x', title: 'VM 10' }, { id: 'y', title: 'vm 2' }, { id: 'z', title: 'VM 1' }]
		expect(applyOrder(titled, []).order).toEqual(['z', 'y', 'x'])
		expect(applyOrder(titled, ['x']).order).toEqual(['x', 'z', 'y'])
	})
})

describe('updateRequest', () => {
	it('sends only what changed', () => {
		const vm = { title: 'A', vcpus: 1, memory_mib: 512 }
		expect(updateRequest(vm, { title: 'A ', vcpus: 1, memory_mib: 512 })).toEqual({})
		expect(updateRequest(vm, { title: 'B', vcpus: 2, memory_mib: 512 })).toEqual({ title: 'B', vcpus: 2 })
	})
})

describe('keysForText', () => {
	it('holds Shift for what needs it on a US keyboard', () => {
		const keys = keysForText('a_B|:1')
		expect(keys.map(k => k.shift)).toEqual([false, true, true, true, true, false])
		expect(keys.map(k => k.keysym)).toEqual([0x61, 0x5F, 0x42, 0x7C, 0x3A, 0x31])
	})

	it('turns line breaks into Return and drops carriage returns', () => {
		expect(keysForText('a\r\nb').map(k => k.keysym)).toEqual([0x61, KEYSYM.Return, 0x62])
	})

	it('sends characters beyond Latin-1 as Unicode keysyms', () => {
		expect(keysForText('€')[0].keysym).toBe(0x010020AC)
	})
})

describe('disks', () => {
	const boot = { path: '/DATA/VM/a.qcow2', target: 'vda', boot: true, managed: true, capacity_bytes: 32 * 1024 ** 3 }
	const extra = { path: '/DATA/VM/a-1.qcow2', target: 'vdb', boot: false, managed: true, capacity_bytes: 1.5 * 1024 ** 3 }
	const foreign = { path: '/srv/b.qcow2', target: 'vdc', boot: false, managed: false, capacity_bytes: 1024 ** 3 }

	it('rounds a size up to whole GB', () => {
		expect(diskGiB(32 * 1024 ** 3)).toBe(32)
		expect(diskGiB(1.5 * 1024 ** 3)).toBe(2)
		expect(diskGiB(undefined)).toBe(0)
	})

	it('grows the disks CasaOS created, running or off', () => {
		const running = { state: 'running', managed: true }
		expect(diskActions(running, boot).resize).toBe(true)
		expect(diskActions(running, foreign).resize).toBe(false)
		expect(diskActions({ state: 'creating', managed: true }, boot).resize).toBe(false)
		expect(diskActions({ state: 'running', managed: false }, boot).resize).toBe(false)
	})

	it('removes a disk only from a VM that is off, and never the boot disk', () => {
		const off = { state: 'shut-off', managed: true }
		expect(diskActions(off, extra).remove).toBe(true)
		expect(diskActions(off, foreign).remove).toBe(true)
		expect(diskActions(off, boot).remove).toBe(false)
		expect(diskActions({ state: 'running', managed: true }, extra).remove).toBe(false)
	})

	it('adds disks to VMs CasaOS created', () => {
		expect(canAddDisk({ state: 'running', managed: true })).toBe(true)
		expect(canAddDisk({ state: 'shut-off', managed: true })).toBe(true)
		expect(canAddDisk({ state: 'creating', managed: true })).toBe(false)
		expect(canAddDisk({ state: 'shut-off', managed: false })).toBe(false)
	})
})

describe('disk plan', () => {
	it('starts empty', () => {
		expect(diskPlanIsEmpty(emptyDiskPlan())).toBe(true)
	})

	it('removes first, then grows, then adds, and does not grow a disk it removes', () => {
		const plan = { grow: { vdb: 64, vdc: 16 }, remove: { vdc: true }, add: [32] }
		expect(diskPlanSteps(plan)).toEqual([
			{ kind: 'remove', target: 'vdc', deleteFile: true },
			{ kind: 'grow', target: 'vdb', sizeGib: 64 },
			{ kind: 'add', sizeGib: 32 },
		])
	})

	it('leaves what is still to do when a Save stops halfway', () => {
		let plan = { grow: { vdb: 64 }, remove: { vdc: false }, add: [32, 32] }
		const steps = diskPlanSteps(plan)
		plan = withoutStep(plan, steps[0])
		plan = withoutStep(plan, steps[1])
		plan = withoutStep(plan, steps[2])
		expect(plan).toEqual({ grow: {}, remove: {}, add: [32] })
		expect(diskPlanIsEmpty(withoutStep(plan, steps[3]))).toBe(true)
	})
})

describe('port forwards', () => {
	const web = { protocol: 'tcp', host_port: 8081, guest_port: 80 }
	const dns = { protocol: 'udp', host_port: 5353, guest_port: 53 }

	it('reads as protocol, host port, VM port', () => {
		expect(portLabel(web)).toBe('TCP 8081 → 80')
	})

	it('compares lists whatever their order', () => {
		expect(samePorts([web, dns], [dns, web])).toBe(true)
		expect(samePorts([web], [web, dns])).toBe(false)
		expect(samePorts([], undefined)).toBe(true)
	})

	it('refuses ports out of range and a host port forwarded twice', () => {
		expect(validatePort({ protocol: 'tcp', host_port: 0, guest_port: 80 }, [])).toBe('Ports go from 1 to 65535.')
		expect(validatePort({ protocol: 'tcp', host_port: 8081, guest_port: null }, [])).toBe('Ports go from 1 to 65535.')
		expect(validatePort({ protocol: 'tcp', host_port: 8081, guest_port: 22 }, [web])).toBe('This port of the machine is forwarded already.')
		// the same number on the other protocol is another port
		expect(validatePort({ protocol: 'udp', host_port: 8081, guest_port: 22 }, [web])).toBe('')
	})
})

describe('networks', () => {
	const host = { network: 'casaos', bridges: ['br0'], links: ['enp3s0'] }

	it('offers the CasaOS network, the bridges and macvtap on the wired cards', () => {
		expect(networkOptions(host).map(o => o.value)).toEqual(['casaos', 'bridge:br0', 'macvtap:enp3s0'])
		expect(networkOptions({ network: 'casaos' }).map(o => o.label)).toEqual(['NAT (casaos)'])
	})

	it('turns an option into a request and a VM network back into an option', () => {
		expect(networkChoice('casaos')).toEqual({ mode: 'casaos' })
		expect(networkChoice('bridge:br0')).toEqual({ mode: 'bridge', source: 'br0' })
		expect(networkChoice('macvtap:enp3s0')).toEqual({ mode: 'macvtap', source: 'enp3s0' })
		expect(networkValue({ mode: 'casaos', name: 'casaos' })).toBe('casaos')
		expect(networkValue({ mode: 'bridge', source: 'br0' })).toBe('bridge:br0')
		expect(networkValue({ type: 'user' })).toBe('')
		expect(networkLabel({ mode: 'macvtap', source: 'enp3s0', type: 'direct' })).toBe('macvtap (enp3s0)')
		expect(networkLabel({ type: 'user' })).toBe('user')
	})

	it('sends a network only when it is not the CasaOS one', () => {
		const form = { ...createDefaults(host), title: 'x' }
		expect(createRequest(form).network).toBeUndefined()
		expect(createRequest({ ...form, network: 'bridge:br0' }).network).toEqual({ mode: 'bridge', source: 'br0' })
	})
})

describe('oS', () => {
	it('guesses what an image installs from its name', () => {
		expect(guessOS('/DATA/VM/iso/ubuntu-24.04.1-live-server-amd64.iso')).toBe('ubuntu')
		expect(guessOS('/DATA/VM/haos_ova-13.2.qcow2.xz')).toBe('homeassistant')
		expect(guessOS('/DATA/VM/iso/Win11_24H2_Italian_x64.iso')).toBe('windows')
		expect(guessOS('/DATA/VM/iso/alpine-virt-3.24.2-x86_64.iso')).toBe('alpine')
		expect(guessOS('/DATA/VM/iso/linuxmint-22.2-cinnamon-64bit.iso')).toBe('mint')
		expect(guessOS('/DATA/VM/disk.qcow2')).toBe('')
	})

	it('falls back to a plain monitor', () => {
		expect(osInfo('').icon).toBe('monitor')
		expect(osInfo('nothing').icon).toBe('monitor')
		expect(osInfo('windows').icon).toBe('microsoft-windows')
	})
})

describe('memory in GB', () => {
	it('converts both ways', () => {
		expect(mibToGB(2048)).toBe(2)
		expect(mibToGB(768)).toBe(0.75)
		expect(gbToMib(1.5)).toBe(1536)
	})
})

describe('addresses', () => {
	const host = { network_subnet: '192.168.123.0/24' }
	const fixed = { casaos: true, fixed: true, ip: '192.168.123.5' }
	const dhcp = { casaos: true, ip: '192.168.123.140' }

	it('reads how a VM gets its address', () => {
		expect(addressForm(fixed)).toEqual({ mode: 'fixed', ip: '192.168.123.5' })
		expect(addressForm(dhcp)).toEqual({ mode: 'dhcp', ip: '' })
		expect(addressForm({ mode: 'bridge' })).toEqual({ mode: 'fixed', ip: '' })
	})

	it('asks for a change only when there is one', () => {
		expect(addressRequest(fixed, { mode: 'fixed', ip: '192.168.123.5' })).toBeUndefined()
		expect(addressRequest(fixed, { mode: 'fixed', ip: '192.168.123.9' })).toBe('192.168.123.9')
		expect(addressRequest(fixed, { mode: 'dhcp', ip: '' })).toBe('dhcp')
		expect(addressRequest(dhcp, { mode: 'dhcp', ip: '' })).toBeUndefined()
		expect(addressRequest(dhcp, { mode: 'fixed', ip: '' })).toBe('')
		// coming from a bridge: any free fixed address
		expect(addressRequest({ mode: 'bridge' }, { mode: 'fixed', ip: '' })).toBe('')
	})

	it('shows in the list the address of a running VM, and a fixed one when off', () => {
		expect(listAddress({ state: 'running', network: dhcp })).toEqual({ ip: '192.168.123.140', stale: false })
		expect(listAddress({ state: 'running', network: { mode: 'bridge', ip: '192.168.10.183' } }))
			.toEqual({ ip: '192.168.10.183', stale: false })
		expect(listAddress({ state: 'shut-off', network: fixed })).toEqual({ ip: '192.168.123.5', stale: true })
		expect(listAddress({ state: 'shut-off', network: { mode: 'macvtap' } })).toBeNull()
		expect(listAddress({ state: 'running' })).toBeNull()
	})

	it('keeps fixed addresses in .2-.99 of the network', () => {
		expect(validateAddress('', host)).toBe('')
		expect(validateAddress('192.168.123.50', host)).toBe('')
		expect(validateAddress('192.168.123.150', host)).not.toBe('')
		expect(validateAddress('192.168.1.50', host)).not.toBe('')
		expect(validateAddress('nonsense', host)).not.toBe('')
	})
})

describe('formatDate', () => {
	it('takes the dashboard\'s language names', () => {
		expect(formatDate('2026-09-26T20:23:06Z', 'it_it')).not.toBe('')
		expect(formatDate('2026-09-26T20:23:06Z', 'nonsense_tag_x')).not.toBe('')
		expect(formatDate('garbage', 'en_us')).toBe('')
	})
})

describe('createRequest and the address', () => {
	const host = { network: 'casaos', network_subnet: '192.168.123.0/24' }
	const form = { ...createDefaults(host), title: 'x' }

	it('asks for DHCP or a chosen address on the CasaOS network only', () => {
		expect(createRequest(form).network).toBeUndefined()
		expect(createRequest({ ...form, address: { mode: 'dhcp', ip: '' } }).network).toEqual({ mode: 'casaos', address: 'dhcp' })
		expect(createRequest({ ...form, address: { mode: 'fixed', ip: ' 192.168.123.9 ' } }).network).toEqual({ mode: 'casaos', address: '192.168.123.9' })
		expect(createRequest({ ...form, network: 'bridge:br0', address: { mode: 'dhcp', ip: '' } }).network).toEqual({ mode: 'bridge', source: 'br0' })
	})

	it('refuses a fixed address out of range', () => {
		expect(validateCreate({ ...form, address: { mode: 'fixed', ip: '192.168.123.150' } }, host).address).toBeTruthy()
		expect(validateCreate({ ...form, network: 'bridge:br0', address: { mode: 'fixed', ip: 'bad' } }, host).address).toBeUndefined()
	})
})

describe('uSB', () => {
	const host = [
		{ vendor: '0bda', product: '8153', name: 'LAN', in_use: 'network card enx0' },
		{ vendor: '174f', product: '244c', name: 'Camera' },
		{ vendor: '05e3', product: '0751', name: 'Card reader', vm_id: 'other', vm_title: 'HA' },
		{ vendor: '1234', product: '5678', name: 'Stick', vm_id: 'me', vm_title: 'me' },
	]
	const vm = { id: 'me', usb: [{ vendor: '1234', product: '5678', connected: true }, { vendor: 'dead', product: 'beef', connected: false }] }

	it('lists the host\'s devices and the VM\'s unplugged ones', () => {
		const rows = usbRows(host, vm)
		expect(rows.map(r => r.id)).toEqual(['0bda:8153', '174f:244c', '05e3:0751', '1234:5678', 'dead:beef'])
		expect(rows.find(r => r.id === '0bda:8153').blocked.key).toMatch(/Used by this machine/)
		expect(rows.find(r => r.id === '05e3:0751').blocked.params).toEqual({ vm: 'HA' })
		expect(rows.find(r => r.id === '174f:244c').blocked).toBeNull()
		expect(rows.find(r => r.id === '1234:5678')).toMatchObject({ attached: true, blocked: null })
		expect(rows.find(r => r.id === 'dead:beef')).toMatchObject({ attached: true, connected: false })
	})

	it('sends the whole list with one device switched', () => {
		const rows = usbRows(host, vm)
		expect(usbRequest(vm, rows[1], true)).toEqual([
			{ vendor: '1234', product: '5678' },
			{ vendor: 'dead', product: 'beef' },
			{ vendor: '174f', product: '244c' },
		])
		expect(usbRequest(vm, rows[3], false)).toEqual([{ vendor: 'dead', product: 'beef' }])
	})
})

describe('downloadProgress', () => {
	it('is a whole percent, or unknown without a size', () => {
		expect(downloadProgress({ done_bytes: 50, total_bytes: 200 })).toEqual({ percent: 25 })
		expect(downloadProgress({ done_bytes: 199, total_bytes: 200 })).toEqual({ percent: 99 })
		expect(downloadProgress({ done_bytes: 10 })).toEqual({ percent: null })
	})
})

describe('createRequest and the folder', () => {
	const host = { storage_path: '/DATA/VM' }

	it('names a folder only when it is not the default', () => {
		const form = { ...createDefaults(host), title: 'x' }
		expect(form.storage_path).toBe('/DATA/VM')
		expect(createRequest(form, host).storage_path).toBeUndefined()
		expect(createRequest({ ...form, storage_path: '/media/Big/VM' }, host).storage_path).toBe('/media/Big/VM')
	})
})
