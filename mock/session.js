const USER = JSON.stringify({
	id: 1,
	username: 'casaos',
	nickname: 'casaos',
	role: 'admin',
	avatar: '',
	description: '',
})

export function seedMockSession(storage = localStorage) {
	if (storage.getItem('access_token')) {
		return
	}
	storage.setItem('access_token', 'mock-access')
	storage.setItem('refresh_token', 'mock-refresh')
	storage.setItem('expires_at', '2000000000')
	storage.setItem('user', USER)
}

export function clearMockSession(storage = localStorage) {
	if (storage.getItem('access_token') !== 'mock-access' && storage.getItem('refresh_token') !== 'mock-refresh') {
		return
	}
	storage.removeItem('access_token')
	storage.removeItem('refresh_token')
	storage.removeItem('expires_at')
	storage.removeItem('user')
}
