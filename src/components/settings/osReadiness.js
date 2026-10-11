/**
 * What the dashboard makes of GET /v1/sys/os/readiness: the report that says whether this
 * machine could be upgraded to the next release, and why not.
 *
 * Texts are language-file keys, and the core's codes pick them: the dashboard never matches
 * the core's English words. A code it does not know is shown with the core's own title and
 * detail, as text, never blank, and never breaks the view. Every value that comes from the
 * core is shown as a text node, never as HTML.
 *
 * Fail closed, here as in the core: a check that did not answer is a blocker, and the window
 * never says Ready next to one, whatever state the core sent.
 */

import { formatDate, releaseName } from './osSupport'

const MIB = 1048576
const GIB = 1073741824

// Only the own properties of a table: a code or a state named like an Object method is not one.
function own(table, key) {
	return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined
}

const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value)

// A text from the core, trimmed and cut: what a row says is not a page.
function text(value, max = 300) {
	return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/**
 * 300 MiB or 1.5 GiB, written for a language ("1,5 Gio" in French), or '' for anything that
 * is not a size. `locale` is an Intl tag or a language-file name such as fr_fr.
 */
export function formatSize(bytes, locale = 'en') {
	if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0)
		return ''
	const french = /^fr/i.test(String(locale))
	const [mib, gib] = french ? ['Mio', 'Gio'] : ['MiB', 'GiB']
	// Cut down to what is shown, never rounded up: "only 2 GiB free, and at least 2 GiB is needed" is what
	// a refusal on 2047 MiB would say. (bytes * 10 and the division by a power of two are exact.)
	const [value, unit] = bytes >= GIB ? [Math.floor(bytes * 10 / GIB) / 10, gib] : [Math.floor(bytes / MIB), mib]
	const options = { maximumFractionDigits: unit === gib ? 1 : 0 }
	let number
	try {
		number = new Intl.NumberFormat(String(locale).replace('_', '-'), options).format(value)
	} catch {
		// a language-file name that is not an Intl tag
		number = new Intl.NumberFormat('en', options).format(value)
	}
	return `${number} ${unit}`
}

// 'YYYY-MM-DDTHH:MM:SSZ' written for a language, or '' for anything else.
function formatMoment(iso, locale) {
	if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(iso))
		return ''
	const moment = new Date(iso)
	if (Number.isNaN(moment.getTime()))
		return ''
	const options = { dateStyle: 'medium', timeStyle: 'short' }
	try {
		return new Intl.DateTimeFormat(String(locale).replace('_', '-'), options).format(moment)
	} catch {
		return new Intl.DateTimeFormat('en', options).format(moment)
	}
}

// The data a sentence can use, by the name of its placeholder. A parameter reads the first of the
// core's data fields (its `keys`, in this order) that says something it can use, and a sentence is
// said only when every parameter it names is said: the sentence before it is the plain one. The
// field a parameter read is not listed again under the sentence.
//
// The things concerned have the core's own names, by what they are (packages, files, apps,
// services, modules...): the first list it sent is the one the sentence names, the more specific
// ones first (a service before the packages that bring it).
const MAX_NAMES = 20
const NAME_KEYS = ['names', 'services', 'packages', 'modules', 'apps', 'containers', 'files', 'mounts', 'directories', 'devices', 'disks', 'arrays', 'sources', 'units', 'unit', 'architectures']

function nameList(value) {
	const list = (Array.isArray(value) ? value : [value])
		.filter(name => typeof name === 'string' && name.trim())
		.map(name => name.trim().slice(0, 80))
	return list.length > MAX_NAMES ? `${list.slice(0, MAX_NAMES).join(', ')}, …` : list.join(', ')
}

function whole(max) {
	return value => Number.isInteger(value) && value >= 0 && value <= max ? String(value) : ''
}

// a size, in the unit its field's name gives
const UNITS = [['bytes', 1], ['kib', 1024], ['mib', MIB], ['gib', GIB]]
function sizeKeys(...bases) {
	return bases.flatMap(base => UNITS.map(([unit, factor]) => [`${base}_${unit}`, factor]))
}
const size = (value, locale, factor) => typeof value === 'number' ? formatSize(value * factor, locale) : ''

// The systems the core names as variants (pkg/ossupport): their makers' own names, which are not translated.
const VARIANT_NAMES = {
	raspberrypi: 'Raspberry Pi OS',
	armbian: 'Armbian',
	dietpi: 'DietPi',
	proxmox: 'Proxmox VE',
	proxmox_backup: 'Proxmox Backup Server',
	proxmox_mail: 'Proxmox Mail Gateway',
	openmediavault: 'OpenMediaVault',
	truenas: 'TrueNAS',
}

const PARAMS = {
	names: { keys: NAME_KEYS.map(key => [key]), read: nameList },
	variant: { keys: [['variant']], read: value => own(VARIANT_NAMES, value) ?? '' },
	arch: { keys: [['arch']], read: value => typeof value === 'string' && /^[\w.-]{1,32}$/.test(value) ? value : '' },
	days: { keys: [['days']], read: whole(100000) },
	percent: { keys: [['percent'], ['capacity']], read: whole(100) },
	// the day before which the upgrade is not offered
	date: { keys: [['date'], ['not_before']], read: (value, locale) => formatDate(value, 'day', locale) },
	free: { keys: sizeKeys('free', 'available'), read: size },
	needed: { keys: sizeKeys('needed', 'required', 'minimum', 'min'), read: size },
	total: { keys: sizeKeys('total'), read: size },
}

// The first of a parameter's fields that says something: what it says and the field it came from.
function resolve(param, data, locale) {
	for (const [key, factor] of param.keys) {
		const value = param.read(data[key], locale, factor)
		if (value)
			return { value, key }
	}
	return null
}

/**
 * One entry per code of the readiness spec: a `label` (what is looked at, for the list of what
 * passed and as the title of a row) and the sentence of the code. A sentence is a language-file
 * key, or a list of them: the first whose `{placeholders}` the core's data fills is the one said,
 * and the last has none, so that a core that sent no data still gets its sentence. `warn`,
 * `info` and `refuse` say the same code differently when it comes with that severity; a code
 * says `text` for any severity it has no sentence of its own for. A code whose cause the core
 * tells apart by one field of its data (`by`: the kind of boot loader, why a disk was not looked
 * at) has a sentence per value of it in `variants`, each a sentence or a list like the above; the
 * field is not listed again. `actions` says, per action code, when the action fits the code: false
 * for never, or a function of the data.
 *
 * What the sentences say is what the owner can do about it, or what the upgrade does by itself.
 * A code that normally comes with an `action` says what it means, and the action says what to do.
 */
export const READINESS_CHECKS = {
	// identity and host
	unsupported_os: {
		label: 'Operating system version',
		text: 'This system is not a Debian or Ubuntu release that ReCasaOS can upgrade: only Debian and the long-term Ubuntu releases are covered. Use the maker\'s own upgrade tool, or reinstall.',
	},
	vendor_os: {
		label: 'Distribution variant',
		text: [
			'This system is {variant}, a variant of Debian or Ubuntu whose maker has its own way to upgrade, or advises a fresh install. ReCasaOS will not upgrade it: follow the maker\'s instructions.',
			'This system is a variant of Debian or Ubuntu (such as Raspberry Pi OS, Armbian, DietPi, Proxmox, OpenMediaVault or TrueNAS) whose maker has its own way to upgrade, or advises a fresh install. ReCasaOS will not upgrade it: follow the maker\'s instructions.',
		],
	},
	unproven_arch: {
		label: 'Processor type',
		text: [
			'This machine\'s processor type is {arch}, but the upgrade has only been proven on 64-bit Intel and AMD machines (amd64). ReCasaOS will not upgrade it.',
			'The upgrade has only been proven on 64-bit Intel and AMD machines (amd64), and this machine is different. ReCasaOS will not upgrade it.',
		],
	},
	container: {
		label: 'Running in a container',
		text: 'This system runs inside a container (such as LXC, Docker or WSL): the machine it runs on owns its kernel and its network. It cannot be upgraded from here. Upgrade the host instead.',
	},
	virt_xen: {
		label: 'Xen virtual machine',
		text: 'This is a Xen virtual machine. After the upgrade, Xen gives the network interfaces new names, which can leave the machine without a network, so ReCasaOS will not upgrade it.',
	},
	no_systemd: {
		label: 'Service manager',
		text: 'The upgrade needs systemd to be the first program the system starts, and it is not here. ReCasaOS will not upgrade this machine.',
	},
	not_root: {
		label: 'Administrator rights',
		text: 'ReCasaOS is not running with administrator rights (root), so it cannot see everything an upgrade depends on. Run it as the installer sets it up, as root.',
	},

	// process and state
	busy: {
		label: 'Other package work',
		text: [
			'Something else is changing the system\'s packages right now ({names}).',
			'Something else is changing the system\'s packages right now: an update, the automatic updates or another package manager.',
		],
	},
	apps: {
		label: 'Apps in progress',
		text: [
			'These apps have an operation in progress: {names}. An upgrade must not start meanwhile.',
			'An app operation is in progress, or ReCasaOS could not find out whether one is. An upgrade must not start meanwhile.',
		],
	},
	reboot_first: {
		label: 'Pending restart',
		text: 'A newer kernel is installed than the one running, or the system asked for a restart. Restarting first also proves that the machine starts properly before it is upgraded.',
	},
	uptime_long: {
		label: 'Time since the last restart',
		text: [
			'This machine has run for {days} days without a restart. The first restart is the riskiest moment of an upgrade, so restart it once beforehand to see that it comes back.',
			'This machine has run for a very long time without a restart (over 180 days). The first restart is the riskiest moment of an upgrade, so restart it once beforehand to see that it comes back.',
		],
	},
	broken_dpkg: {
		label: 'Package manager state',
		text: 'The package manager (dpkg) has an operation left unfinished, or is in an inconsistent state, so an upgrade would start from a broken base.',
	},
	held: {
		label: 'Held packages',
		text: [
			'Some packages are on hold ({names}). A hold is a deliberate choice, so ReCasaOS never lifts it for you, and the upgrade can fail halfway when it cannot update them.',
			'Some packages are on hold. A hold is a deliberate choice, so ReCasaOS never lifts it for you, and the upgrade can fail halfway when it cannot update them.',
		],
	},
	held_docker: {
		label: 'Docker packages on hold',
		text: 'Docker\'s packages are on hold. That is harmless here: the upgrade pauses Docker\'s package source and leaves Docker as it is.',
	},

	// package sources (read from the files, never fetched)
	sources_cdrom: {
		label: 'Package sources: CD or local folder',
		text: [
			'A package source points to a CD-ROM or a local folder ({names}), which the upgrade cannot follow to the next release.',
			'A package source points to a CD-ROM or a local folder, which the upgrade cannot follow to the next release.',
		],
	},
	sources_alias: {
		label: 'Package sources: release nicknames',
		text: [
			'A package source follows a release nickname such as stable or oldstable, instead of the release\'s own name such as bullseye ({names}). A nickname silently moves to another release, which breaks the upgrade.',
			'A package source follows a release nickname such as stable or oldstable, instead of the release\'s own name such as bullseye. A nickname silently moves to another release, which breaks the upgrade.',
		],
	},
	sources_pin: {
		label: 'Package pinning',
		text: 'A pinning rule (a preference file or a default release setting) ties packages to one release, which stops the upgrade from moving them to the next one.',
	},
	sources_proposed: {
		label: 'Package sources: pre-release updates',
		text: 'A package source includes the pre-release updates of a release (proposed or proposed-updates). They are not meant for a machine you rely on, and they upset the upgrade.',
	},
	sources_format: {
		label: 'Package source files',
		text: [
			'A package source file is written in a form ReCasaOS cannot read ({names}): only the usual .list and .sources files are understood, so it cannot be rewritten for the next release.',
			'A package source file is written in a form ReCasaOS cannot read: only the usual .list and .sources files are understood, so it cannot be rewritten for the next release.',
		],
	},
	sources_third_party: {
		label: 'Third-party package sources',
		text: [
			'Package sources that do not come from Debian or Ubuntu are paused for the upgrade and stay paused afterwards, so the software they provide gets no updates until you switch them back on. Docker\'s source is the exception: it is rewritten after the upgrade. Sources: {names}.',
			'Package sources that do not come from Debian or Ubuntu are paused for the upgrade and stay paused afterwards, so the software they provide gets no updates until you switch them back on. Docker\'s source is the exception: it is rewritten after the upgrade.',
		],
		// nothing in the sources is wrong: the sentence says what the upgrade does with them
		actions: { review_sources: false },
	},
	sources_backports: {
		label: 'Backports',
		text: 'Backports lines in the package sources will be removed by the upgrade. Packages already installed from backports stay, but no longer get updates from there.',
	},
	sources_firmware: {
		label: 'Firmware component',
		text: 'The upgrade will add the non-free-firmware component to the Debian package sources, because this machine uses non-free software or firmware packages that now live there.',
	},
	sources_network_checked_later: {
		label: 'Package sources on the network',
		text: 'Whether each package source offers the next release, and whether the security archive is complete, needs the internet. It is checked later, when the upgrade is planned, not by this check.',
	},

	// packages
	foreign_arch: {
		label: 'Other architectures',
		text: [
			'Packages built for another processor architecture are installed ({names}). They can make the upgrade fail or leave mismatched libraries: remove them first, then the architecture itself (sudo dpkg --remove-architecture, followed by its name).',
			'Packages built for another processor architecture (for example i386) are installed. They can make the upgrade fail or leave mismatched libraries: remove them first, then the architecture itself (sudo dpkg --remove-architecture, followed by its name).',
		],
		// the sentence says what to remove: the package sources have nothing wrong
		actions: { review_sources: false },
	},
	keyring_old: {
		label: 'Package signing keys',
		text: 'The keys that sign Debian packages are older than the next release needs. The upgrade brings them up to date first, so there is nothing to do.',
	},
	openssh_old: {
		label: 'SSH server version',
		text: 'The SSH server is older than the version needed before upgrading to Debian 13. The upgrade brings it up to date first, so there is nothing to do.',
	},
	host_services: {
		label: 'Server software on this machine',
		text: [
			'This machine runs server software that migrates its own data at each release, and ReCasaOS does not handle that: {names}. Upgrade by hand, following that software\'s own instructions.',
			'This machine runs server software (a database, mail, directory, virtualisation, VPN or backup server) that migrates its own data at each release, and ReCasaOS does not handle that. Upgrade by hand, following that software\'s own instructions.',
		],
	},
	dkms: {
		label: 'Drivers built on this machine',
		text: 'A driver built on this machine (DKMS) runs the network card or the disk the system starts from, or Secure Boot is on with no key for such drivers. After the upgrade it can fail to load, and leave the machine unreachable or unable to start.',
		warn: [
			'Drivers built on this machine (DKMS) are rebuilt for the new kernel during the upgrade ({names}). If one fails, what depends on it, such as a storage pool or a graphics card, stops working.',
			'Drivers built on this machine (DKMS) are rebuilt for the new kernel during the upgrade. If one fails, what depends on it, such as a storage pool or a graphics card, stops working.',
		],
	},

	// filesystem and boot
	merged_usr: {
		label: 'Merged /usr layout',
		text: [
			'The folders {names} are not links to /usr, which Debian 12 and later require. ReCasaOS does not convert this for you: it has to be converted by hand first.',
			'The folders /bin, /sbin and /lib are not links to /usr, which Debian 12 and later require. ReCasaOS does not convert this for you: it has to be converted by hand first.',
		],
	},
	cgroup1: {
		label: 'Control groups version',
		text: 'The system is set to use the old version of control groups (cgroup v1), which the next release no longer supports and which would stop your containers from working. Remove the setting that forces it, restart, then check again.',
	},
	bootloader: {
		label: 'Boot loader',
		text: 'The boot loader is not set up the way the upgrade needs: it must be GRUB, with its target disk known on a BIOS machine, or its boot partition mounted with free space on a UEFI machine. A faulty boot loader can leave the machine unable to start.',
		// the core sends no action for it: each sentence says what to do
		by: 'kind',
		variants: {
			not_grub: 'The boot loader is not GRUB. The upgrade is proven with GRUB only, and with another boot loader (rEFInd, extlinux, a board\'s own) ReCasaOS cannot know that the new kernel would be started. It will not upgrade this machine.',
			systemd_boot: 'This machine starts with systemd-boot, not GRUB. The upgrade is proven with GRUB only, and it does not look after systemd-boot\'s files, so ReCasaOS cannot know that the new kernel would be started. It will not upgrade this machine.',
			esp_not_mounted: 'This machine starts with UEFI, and GRUB is updated on the EFI system partition, which is not mounted on /boot/efi: the new boot loader would be written in the wrong place, or not at all. Mount it, then check again.',
			esp_full: [
				'The EFI system partition (/boot/efi) has only {free} free, and GRUB needs at least {needed} to be written on it again. Free some room on it, then check again.',
				'The EFI system partition (/boot/efi) has too little room left for GRUB to be written on it again. Free some room on it, then check again.',
			],
			install_devices_empty: 'GRUB is installed on a BIOS machine and the disk it must be written to is not set, so its update, which runs with nobody to answer, would end in error and could leave the machine unable to start. Set the disk with sudo dpkg-reconfigure grub-pc, then check again.',
			install_device_missing: 'A disk that GRUB is set to be written to is not one of this machine\'s disks any more, so its update would end in error and could leave the machine unable to start. Set the disks again with sudo dpkg-reconfigure grub-pc, then check again.',
		},
	},
	root_zfs: {
		label: 'System disk on ZFS',
		text: 'The system disk uses ZFS, and upgrading it can leave the machine unable to start. ReCasaOS will not upgrade it.',
	},
	root_luks: {
		label: 'Encrypted system disk',
		text: 'The system disk is encrypted (LUKS). The upgrade changes how it is unlocked at start, and a machine without a screen cannot be unlocked remotely if that goes wrong. ReCasaOS will not upgrade it.',
	},
	md_degraded: {
		label: 'RAID health',
		text: [
			'A software RAID array is not whole: one of its disks is missing or has failed, or the array is not running ({names}). An upgrade writes a lot and ends with a restart, so repair the array first.',
			'A software RAID array is not whole: one of its disks is missing or has failed, or the array is not running. An upgrade writes a lot and ends with a restart, so repair the array first.',
		],
	},
	smart_failed: {
		label: 'Disk health',
		text: [
			'A disk reports that it is failing ({names}). An upgrade writes a lot and ends with a restart, so replace the disk and restore from a backup first.',
			'A disk reports that it is failing. An upgrade writes a lot and ends with a restart, so replace the disk and restore from a backup first.',
		],
		// said when the core gives no reason it knows
		info: 'The health of the disks was not checked. Make sure your disks are healthy before upgrading.',
		by: 'why',
		variants: {
			no_smartctl: 'The health of the disks was not checked, because the smartctl tool is not installed. Make sure your disks are healthy before upgrading.',
			unavailable: [
				'The disk did not say how healthy it is ({names}): it may be a virtual disk, or its controller does not pass the question on. Its health was not checked, so make sure your disks are healthy before upgrading.',
				'The disk did not say how healthy it is: it may be a virtual disk, or its controller does not pass the question on. Its health was not checked, so make sure your disks are healthy before upgrading.',
			],
			no_block_device: 'The system is not on a disk that can be asked how healthy it is (it is on the network or in memory), so no disk health was checked. Make sure your disks are healthy before upgrading.',
			no_disk: 'No physical disk was found under the system, so no disk health was checked. Make sure your disks are healthy before upgrading.',
			standby: [
				'A disk is asleep ({names}) and was not woken to be asked how healthy it is, so its health was not checked. Wake it (reading a file on it does), then check again, or make sure it is healthy before upgrading.',
				'A disk is asleep and was not woken to be asked how healthy it is, so its health was not checked. Wake it (reading a file on it does), then check again, or make sure it is healthy before upgrading.',
			],
			partial: 'The system is spread over many disks, and only the first 16 were asked how healthy they are. The health of the others was not checked: make sure they are healthy before upgrading.',
		},
	},
	fstab_unresolved: {
		label: 'Disks listed in fstab',
		text: [
			'A disk or partition listed in /etc/fstab cannot be found and is not marked optional (nofail), so the machine would stop in rescue mode at its next start ({names}). Fix or remove the line, or mark it nofail.',
			'A disk or partition listed in /etc/fstab cannot be found and is not marked optional (nofail), so the machine would stop in rescue mode at its next start. Fix or remove the line, or mark it nofail.',
		],
	},
	fstab_network: {
		label: 'Network disks in fstab',
		text: [
			'A network share (NFS, CIFS...) in /etc/fstab is mounted at start without _netdev or nofail, so the start waits for the network and stops in rescue mode when it is late ({names}). Add _netdev or nofail to its line.',
			'A network share (NFS, CIFS...) in /etc/fstab is mounted at start without _netdev or nofail, so the start waits for the network and stops in rescue mode when it is late. Add _netdev or nofail to its line.',
		],
	},
	log_on_tmpfs: {
		label: 'Where the logs are kept',
		text: 'ReCasaOS\'s logs (/var/log/casaos) are kept in memory, which is emptied at every restart, so the record of the upgrade would be lost. Move them to a disk.',
	},
	disk_root: {
		label: 'Free space on the system disk',
		text: [
			'The system disk has only {free} free, and the upgrade needs at least {needed}.',
			'There is not enough free space on the system disk: the upgrade needs at least 2 GiB free on / or /usr.',
		],
	},
	disk_archives: {
		label: 'Free space for downloads',
		text: [
			'The disk where the upgrade stores the packages it downloads (/var/cache/apt/archives) has only {free} free, and the upgrade needs at least {needed}.',
			'There is not enough free space where the upgrade stores the packages it downloads (/var/cache/apt/archives): at least 1.5 GiB is needed.',
		],
	},
	disk_boot: {
		label: 'Free space on /boot',
		text: [
			'The /boot partition has only {free} free, and the upgrade needs at least {needed}. The new kernel could not be installed, and the machine might not start.',
			// the upgrade to Debian 13, whose /boot is too small in all: the core sends the size and no free room
			'The /boot partition is too small for the upgrade to Debian 13: its filesystem is only {total}, and Debian 13 asks for a partition of 768 MB, whose filesystem is at least {needed}. Freeing room does not make it larger: the partition itself has to be made larger first.',
			'There is not enough room on /boot: at least 300 MiB must be free, and for the upgrade to Debian 13 the partition itself must be about 768 MB. The new kernel could not be installed, and the machine might not start.',
		],
		// freeing room is for a /boot that lacks it, and never makes a partition larger
		actions: { free_disk_space: (data, locale) => Boolean(resolve(PARAMS.free, data, locale)) },
	},
	ram: {
		label: 'Memory',
		text: [
			'The machine has only {total} of memory and swap together, too little for an upgrade.',
			'The machine has less than 1 GiB of memory and swap together, too little for an upgrade.',
		],
		warn: [
			'The machine has only {total} of memory and swap together: the upgrade can be slow and might fail. Add swap or memory if you can.',
			'The machine has less than 2 GiB of memory and swap together: the upgrade can be slow and might fail. Add swap or memory if you can.',
		],
	},
	power: {
		label: 'Power',
		// what the core refuses: a battery that discharges, or one under 50% whatever it does (charging, full, not charging)
		text: [
			'The machine\'s battery is at {percent}%, and an upgrade needs it at 50% or more: a power cut in the middle of an upgrade can leave it unable to start. Keep it plugged in and let it charge.',
			'The machine\'s battery is under 50%, which is too low for an upgrade: a power cut in the middle of an upgrade can leave it unable to start. Keep it plugged in and let it charge.',
		],
		by: 'status',
		variants: {
			discharging: [
				'The machine is running on its battery, which is at {percent}%: a power cut in the middle of an upgrade can leave it unable to start. Plug it in and let it charge.',
				'The machine is running on its battery: a power cut in the middle of an upgrade can leave it unable to start. Plug it in and let it charge.',
			],
		},
	},

	// network
	network_uplink: {
		label: 'Network connection',
		text: 'The machine reaches the network over Wi-Fi only, with no cable. Wi-Fi drivers and settings often change in an upgrade, and the machine could be unreachable afterwards. Plug in a network cable first.',
	},
	network_names: {
		label: 'Network interface names',
		text: 'The upgrade can rename the network interfaces. ReCasaOS checks this just before the restart, in a later step, not here.',
	},

	// Docker and apps
	docker_swarm: {
		label: 'Docker Swarm',
		text: 'This machine is part of a Docker swarm, which the upgrade does not handle.',
	},
	docker_origin: {
		label: 'Where Docker comes from',
		text: 'Docker comes from the system\'s docker.io package, from snap, or from an unknown source. ReCasaOS only upgrades a machine whose Docker was installed from Docker\'s own repository (docker-ce).',
	},
	docker_down: {
		label: 'Docker state',
		text: 'Docker is not running, so ReCasaOS cannot see your containers or tell which ones would not come back after the upgrade. Start Docker, then check again.',
	},
	docker_update_pending: {
		label: 'Docker update waiting',
		text: 'A newer Docker is waiting in the package sources. Update Docker first, from the System packages window, so the upgrade starts from an up-to-date Docker.',
		// Docker's packages on hold: the core says it as a note, and the update of the window asks to confirm
		by: 'held',
		variants: {
			true: 'A newer Docker exists, but Docker\'s packages are on hold. The upgrade leaves Docker as it is, since it pauses Docker\'s package source. You can update Docker from the System packages window (it asks you to confirm, because of the hold), before or after the upgrade.',
		},
	},
	containers_policy: {
		label: 'Apps that restart by themselves',
		text: [
			'These containers are not set to restart by themselves, so they stay stopped after the restart that ends the upgrade: {names}. Start them by hand afterwards, or change their restart policy first.',
			'Some containers are not set to restart by themselves, so they stay stopped after the restart that ends the upgrade. Start them by hand afterwards, or change their restart policy first.',
		],
	},
	containers_ports: {
		label: 'Containers serving the network',
		text: [
			'These containers use the machine\'s own network or publish port 53, 80 or 443: {names}. This machine may be your DNS or web server, which will be down during the upgrade.',
			'Some containers use the machine\'s own network or publish port 53, 80 or 443. This machine may be your DNS or web server, which will be down during the upgrade.',
		],
	},
	backup_age: {
		label: 'Last app backup',
		text: [
			'The last app backup is {days} days old. Back up your apps before upgrading: an upgrade has no way back.',
			'The last app backup is older than 7 days, or there is none. Back up your apps before upgrading: an upgrade has no way back.',
		],
	},
	snapshot_reminder: {
		label: 'Snapshot and console access',
		text: 'ReCasaOS cannot see whether you could go back. Before upgrading, take a snapshot of the machine (or of the virtual machine) and make sure you have console access: there is no automatic way back.',
	},

	// neutral states of the hop
	latest: {
		label: 'Release',
		text: 'This is the latest release ReCasaOS knows of: there is nothing newer to upgrade to.',
	},
	not_offered: {
		label: 'Upgrade offered by Ubuntu',
		text: 'Whether Canonical offers this upgrade to your machine can only be known from its servers, over the network, so it is not decided here. It is checked when the upgrade is planned.',
	},
	hold_until: {
		label: 'Waiting period',
		text: [
			'ReCasaOS does not offer the upgrade to this release before {date}: it waits a few weeks after a new release\'s first update, to let early problems come to light.',
			'ReCasaOS does not offer this upgrade yet: it waits a few weeks after a new release\'s first update, to let early problems come to light.',
		],
	},
}

// What to do, by the action code the core sends. `none` and a code it does not know say nothing.
export const READINESS_ACTIONS = {
	restart_machine: 'Restart the machine, then check again.',
	finish_dpkg: 'Finish the interrupted package operation (on the machine, sudo dpkg --configure -a does it), then check again.',
	wait_for_package_manager: 'Wait for the other package work to end, then check again.',
	wait_for_apps: 'Wait for the apps to finish, then check again.',
	free_disk_space: 'Free some disk space, then check again.',
	release_holds: 'Release the holds you no longer need (sudo apt-mark unhold, then the package name), then check again.',
	review_sources: 'Review the package sources, fix or remove the lines that cause this, then check again.',
}

// The names of the fields of `data` that a sentence did not use and that are listed beside it, in the owner's
// words: the field's own name is shown for a name this table does not have (a newer core's). Every name the
// core's checks send (pkg/osreadiness) is here, except the flags (true or false), which are never listed.
const DETAIL_LABELS = {
	id: 'Distribution',
	version_id: 'Version',
	kind: 'Kind',
	why: 'Reason',
	source: 'Source',
	unit: 'Service',
	apps: 'App names',
	count: 'Number',
	running: 'Running kernel',
	installed: 'Installed',
	candidate: 'Version on offer',
	minimum: 'Minimum',
	days: 'Days',
	updates: 'Unfinished operations',
	package: 'Package',
	packages: 'Packages',
	files: 'Files',
	suites: 'Release names',
	hosts: 'Hosts',
	docker_files: 'Docker\'s files',
	default_release: 'Default release',
	architectures: 'Architectures',
	services: 'Services',
	modules: 'Drivers',
	directories: 'Folders',
	filesystem: 'Filesystem',
	mount_point: 'Mount point',
	mounts: 'Mount points',
	dataset: 'ZFS dataset',
	device: 'Device',
	arrays: 'RAID arrays',
	disks: 'Disks',
	path: 'Path',
	free_mib: 'Free (MiB)',
	needed_mib: 'Needed (MiB)',
	total_mib: 'Total (MiB)',
	ram_mib: 'Memory (MiB)',
	swap_mib: 'Swap (MiB)',
	battery: 'Battery',
	status: 'Status',
	percent: 'Charge in %',
	interface: 'Network card',
	origin: 'Origin',
	names: 'Names',
	ports: 'Published ports',
	last_backup: 'Last backup',
	not_before: 'Not before',
	arch: 'Architecture',
	variant: 'Variant',
}

/**
 * The language-file key that says the name of a field of a check's data, or '' for a name this window has
 * no word for.
 */
export function detailLabel(name) {
	return own(DETAIL_LABELS, name) ?? ''
}

// How a listed field is written: its name, then its value.
export const DETAIL_FORMAT = '{name}: {value}'

const UNKNOWN_CHECK = 'A check this window does not know'
const DID_NOT_ANSWER = 'ReCasaOS could not finish this check, so it counts it as a blocker until it can. Check again in a moment.'
// the core's reason `clock`: the date of the machine is before the day its table of releases was written
const CLOCK_WRONG = 'The date of this machine is wrong: it is before the day this version of ReCasaOS was written, so the report cannot tell what upgrade this machine has. Set the date (and the time synchronisation of the machine), then check again.'

// The sentence for the state of the report. A blocked report is counted: see the view.
const STATES = {
	ready: { key: 'Ready', tone: 'is-success' },
	attention: { key: 'Ready, with things to look at', tone: 'is-warning' },
	blocked: { key: 'Not ready', tone: 'is-danger' },
	latest: { key: 'Latest release', tone: 'is-info' },
	unsupported: { key: 'Not supported for an upgrade from here', tone: 'is-warning' },
}
const ONE_BLOCKER = 'Not ready: 1 blocker'
const MANY_BLOCKERS = 'Not ready: {n} blockers'

// Every key of the sentences above, for the language files' test.
export const READINESS_KEYS = [...new Set([
	...Object.values(READINESS_CHECKS).flatMap(entry => [entry.label, ...['text', 'refuse', 'warn', 'info'].flatMap(severity => entry[severity] ?? []), ...Object.values(entry.variants ?? {})].flat()),
	...Object.values(READINESS_ACTIONS),
	...Object.values(DETAIL_LABELS),
	...Object.values(STATES).map(state => state.key),
	ONE_BLOCKER,
	MANY_BLOCKERS,
	UNKNOWN_CHECK,
	DID_NOT_ANSWER,
	CLOCK_WRONG,
	DETAIL_FORMAT,
])]

const SEVERITIES = new Set(['refuse', 'warn', 'info', 'ok'])

// The first sentence of a code whose placeholders the data fills, and the data fields it used. The sentences
// of a code are the ones of the value its `by` field has, when it has one for it, else the one of the
// severity it comes with, else its text.
function sentenceFor(entry, severity, data, locale) {
	const value = entry.by ? data[entry.by] : undefined
	const variant = typeof value === 'string' || typeof value === 'boolean' ? own(entry.variants ?? {}, String(value)) : undefined
	const candidates = [].concat(variant ?? own(entry, severity) ?? entry.text)
	for (const key of candidates) {
		const params = {}
		// the field that chose the sentence is said by it, and not listed again
		const used = variant === undefined ? [] : [entry.by]
		let filled = true
		for (const [, name] of key.matchAll(/\{(\w+)\}/g)) {
			const found = resolve(PARAMS[name], data, locale)
			if (!found) {
				filled = false
				break
			}
			params[name] = found.value
			used.push(found.key)
		}
		if (filled)
			return { key, params, used }
	}
	// unreachable while the last sentence of each code has no placeholder (a test sees to it)
	return { key: candidates.at(-1), params: {}, used: variant === undefined ? [] : [entry.by] }
}

// What to do about a row, if the code says it fits: `actions` of the code says false for an action that
// does not (the sentence says what to do, or there is nothing to do), or a function of the data.
function actionFor(entry, action, data, locale) {
	const sentence = own(READINESS_ACTIONS, action) ?? ''
	const fits = entry ? own(entry.actions ?? {}, action) : undefined
	return typeof fits === 'function' ? (fits(data, locale) ? sentence : '') : fits === false ? '' : sentence
}

const MAX_DETAILS = 6

// What the core said that the sentence did not use, as text: the data is its word on the machine.
// The flags are left out: each says why a check came out as it did, which the sentence of the code
// says already and the report's own text gives in the core's words.
function detailsOf(data, used) {
	const details = []
	for (const [name, value] of Object.entries(data)) {
		if (name === 'unknown' || used.includes(name) || !/^[a-z][a-z0-9_]{0,40}$/.test(name))
			continue
		const items = (Array.isArray(value) ? value : [value]).filter(item => (typeof item === 'string' && item) || typeof item === 'number')
		if (items.length)
			details.push({ name, value: items.map(String).join(', ').slice(0, 200) })
		if (details.length === MAX_DETAILS)
			break
	}
	return details
}

function rowOf(raw, index, locale) {
	const code = text(raw.code, 80)
	const data = isPlain(raw.data) ? raw.data : {}
	// fail closed: a check that did not answer is a blocker, whatever severity came with it
	const unknown = data.unknown === true
	const severity = unknown ? 'refuse' : SEVERITIES.has(raw.severity) ? raw.severity : 'warn'
	const entry = own(READINESS_CHECKS, code)

	const row = {
		id: `${index}-${code}`,
		code,
		severity,
		unknown,
		title: entry ? { key: entry.label } : { text: text(raw.title) || code },
		sentence: null,
		reason: '',
		action: actionFor(entry, raw.action, data, locale),
		details: [],
	}
	if (!entry && !row.title.text)
		row.title = { key: UNKNOWN_CHECK }

	if (unknown) {
		// the date of the machine is wrong: that is the sentence, and the core's English words add nothing to it
		const clock = data.reason === 'clock'
		row.sentence = { key: clock ? CLOCK_WRONG : DID_NOT_ANSWER, params: {} }
		row.reason = clock ? '' : text(raw.detail)
	} else if (severity !== 'ok') {
		if (entry) {
			const { key, params, used } = sentenceFor(entry, severity, data, locale)
			row.sentence = { key, params }
			row.details = detailsOf(data, used)
		} else {
			// a code this window does not know: the core's own words, as text
			const detail = text(raw.detail)
			row.sentence = detail ? { text: detail } : null
			row.details = detailsOf(data, [])
		}
	}
	return row
}

/**
 * The view of the core's answer, or null for an answer that is not a report (or a report whose
 * state it cannot read and that has nothing to show): the window then says the answer could not
 * be read, and never Ready.
 *
 * `locale` is the language of the sentences (an Intl tag or a language-file name such as fr_fr),
 * for the dates and the sizes.
 */
export function readinessView(report, locale = 'en_us') {
	if (!isPlain(report))
		return null

	const rows = (Array.isArray(report.checks) ? report.checks : [])
		.filter(isPlain)
		.map((raw, index) => rowOf(raw, index, locale))
	const group = severity => rows.filter(row => row.severity === severity)
	const blockers = group('refuse')
	// a severity the window does not know is shown with the warnings, never hidden with what passed
	const warnings = rows.filter(row => row.severity === 'warn')
	const notes = group('info')
	const passed = group('ok')

	let state = own(STATES, report.state) ? report.state : ''
	if (!state)
		state = blockers.length ? 'blocked' : warnings.length ? 'attention' : ''
	if (!state)
		return null
	// the window never says Ready next to a blocker, nor Ready next to a warning
	if ((state === 'ready' || state === 'attention') && blockers.length)
		state = 'blocked'
	else if (state === 'ready' && warnings.length)
		state = 'attention'

	const summary = state === 'blocked' && blockers.length
		? blockers.length === 1 ? { key: ONE_BLOCKER, params: {} } : { key: MANY_BLOCKERS, params: { n: blockers.length } }
		: { key: STATES[state].key, params: {} }

	const from = releaseName(isPlain(report.hop?.from) ? report.hop.from : null)
	const to = releaseName(isPlain(report.hop?.to) ? report.hop.to : null)

	return {
		state,
		tone: STATES[state].tone,
		summary,
		hop: from && to ? { from, to } : null,
		blockers,
		warnings,
		notes,
		passed,
		checkedAt: formatMoment(report.checked_at, locale),
		// the core's own plain text of the same report: the window never builds it
		text: typeof report.text === 'string' ? report.text : '',
	}
}

const DISTRIBUTIONS = new Set(['debian', 'ubuntu'])

/**
 * Whether the window offers the check: a known Debian or Ubuntu that is not a variant
 * (Raspberry Pi OS, Armbian... say debian and are not Debian) and has a next release. The
 * same rule as the top bar's badge, plus the release to go to.
 */
export function canCheckReadiness(os) {
	if (!isPlain(os) || os.known === false || os.variant || !DISTRIBUTIONS.has(os.id))
		return false
	return Boolean(releaseName(isPlain(os.next) ? os.next : null))
}
