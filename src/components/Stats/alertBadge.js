// The count of active resource alerts on the Statistics icon. It reads the `alerts` count of the three list routes, once
// and again (debounced) when an alert event goes by. It must stay light: the app grid imports it, so it imports neither the
// page nor apexcharts.
import { reactive } from 'vue'
import { hasVirtualMachines } from '@/components/VirtualMachines/entry'

// The HTTP client is loaded on the first ask, not at the top: the app grid imports this file, and should not pull in the
// client and the store with it (the pattern of hasVirtualMachines).
const listOf = source => import('@/service/stats').then(({ statsApi }) => statsApi.list(source))

const MAX_ITEMS = 500
const MAX_COUNT = 999

const count = n => Math.min(MAX_COUNT, n)

// The sum of the alerts of a list's items; anything that is not a finite number above 0 counts for nothing.
function sumOf(body) {
	if (!body || !Array.isArray(body.items)) {
		return 0
	}
	let sum = 0
	for (const item of body.items.slice(0, MAX_ITEMS)) {
		const n = item?.alerts
		if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
			sum += n
		}
	}
	return count(sum)
}

export function createAlertBadge({ list = listOf, hasVm = hasVirtualMachines, delayMs = 2000, isHidden = () => document.hidden } = {}) {
	const counts = reactive({ app_management: 0, virt_management: 0, core: 0 })
	let timer = null
	let flying = false
	let again = false
	let waiting = false
	let generation = 0

	// a source that fails or says 404 counts 0
	const read = source => Promise.resolve().then(() => list(source)).then(sumOf, () => 0)

	function onVisible() {
		if (isHidden()) {
			return
		}
		stopWaiting()
		load()
	}
	function stopWaiting() {
		if (waiting) {
			waiting = false
			document.removeEventListener('visibilitychange', onVisible)
		}
	}
	function wait() {
		if (!waiting) {
			waiting = true
			document.addEventListener('visibilitychange', onVisible)
		}
	}

	async function load() {
		if (flying) {
			again = true
			return
		}
		flying = true
		const mine = generation
		const virt = Promise.resolve().then(hasVm).catch(() => false).then(there => there ? read('virt_management') : 0)
		const [app, vm, core] = await Promise.all([read('app_management'), virt, read('core')])
		if (mine !== generation) {
			return
		}
		flying = false
		Object.assign(counts, { app_management: app, virt_management: vm, core })
		if (again) {
			again = false
			if (isHidden()) {
				wait()
			} else {
				await load()
			}
		}
	}

	const badge = {
		counts,
		total: () => count(counts.app_management + counts.virt_management + counts.core),
		load,

		// Called for every alert event, whether or not the notification feed kept it.
		refreshSoon() {
			if (timer !== null) {
				return
			}
			if (isHidden()) {
				wait()
				return
			}
			timer = setTimeout(() => {
				timer = null
				if (isHidden()) {
					wait()
				} else {
					load()
				}
			}, delayMs)
		},

		stop() {
			generation++
			clearTimeout(timer)
			timer = null
			flying = false
			again = false
			stopWaiting()
		},
	}
	return badge
}

export const alertBadge = createAlertBadge()
