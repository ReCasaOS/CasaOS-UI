import { normalizeItems } from '@/components/Stats/statsData'

// The memory each app's containers use, by app name, from the Statistics list
// (GET /v2/app_management/stats). An app without a running container has no entry.
export function memoryByApp(raw) {
	const memory = {}
	for (const item of normalizeItems(raw, 'app_management')) {
		if (item.kind === 'app-container' && item.app && item.memory_used > 0) {
			memory[item.app] = (memory[item.app] || 0) + item.memory_used
		}
	}
	return memory
}
