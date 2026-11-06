// What the rest of the dashboard knows about Logs: the name of its card, the card, and how to open the page. The page
// itself is loaded on demand.
import { defineAsyncComponent } from 'vue'
import logsIcon from '@/assets/img/app/logs.svg'
import { openWithEscape } from '@/components/VirtualMachines/modalStack'
import { LOGS_LAUNCH_ID, builtinOpensInNewTab } from '@/mixins/app/appLaunchPreference'

const LogsPage = defineAsyncComponent(() => import('./LogsPage.vue'))

// The name of the card in the app grid, which also keeps its place in the saved order.
export const LOGS_APP_NAME = 'logs'

let probe = null

// Whether AppManagement keeps logs. Asked once: an AppManagement older than the feature (404) has none and is not
// asked again; any other failure is asked again next time.
export function hasLogs() {
	if (!probe) {
		// the HTTP client is loaded here, not at the top: the app grid and the top bar import this file
		probe = import('@/service/logs').then(({ logsApi }) => logsApi.settings()).then((res) => {
			if (!res.ok && res.status !== 404) {
				probe = null
			}
			return res.ok
		}).catch(() => {
			probe = null
			return false
		})
	}
	return probe
}

export function forgetLogs() {
	probe = null
}

export function logsApplication() {
	return {
		id: '4',
		name: LOGS_APP_NAME,
		title: { en_us: 'Logs' },
		icon: logsIcon,
		status: 'running',
		app_type: 'system',
	}
}

// Opens the page in a modal, or on a tab of its own when the App launching setting sends apps, or this one, to a new
// tab. `app`, `box` and `at` (an ISO time to show) are where the page starts.
export function openLogs(buefy, state, { app, box, at } = {}) {
	const asked = Object.fromEntries(Object.entries({ app, box, at }).filter(([, v]) => v))

	if (builtinOpensInNewTab(LOGS_LAUNCH_ID, state)) {
		const query = new URLSearchParams(asked).toString()
		window.open(`${window.location.pathname}#/logs${query ? `?${query}` : ''}`, '_blank')
		return null
	}

	// a window already on screen is the one to use, unless it is asked for another place
	const open = document.querySelector('.logs-modal.is-active .logs-page')
	if (open && !Object.keys(asked).length) {
		open.querySelector('h3')?.focus({ preventScroll: true })
		return null
	}

	return openWithEscape(buefy, {
		component: LogsPage,
		props: { initialApp: app || '', initialAt: at || '', initialBox: box || '' },
		hasModalCard: true,
		trapFocus: true,
		scroll: 'keep',
		animation: 'zoom-in',
		customClass: 'logs-modal',
	})
}
