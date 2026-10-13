// What the service says of the machine and of the VMs, for the specs
export const HOST = {
	libvirt: 'available',
	kvm: true,
	uefi: true,
	cpus: 8,
	memory_mib: 16384,
	storage_path: '/DATA/VM',
	storage_free_bytes: 500 * 1024 ** 3,
}

export function aVm(fields = {}) {
	return {
		id: 'vm-1',
		name: 'debian',
		title: 'Debian',
		state: 'running',
		os: '',
		vcpus: 2,
		memory_mib: 2048,
		firmware: 'uefi',
		managed: true,
		console: true,
		network: { mode: 'casaos', name: 'casaos', casaos: true, fixed: true, ip: '10.8.0.10' },
		disks: [],
		snapshots: [],
		ports: [],
		cdrom: '',
		...fields,
	}
}
