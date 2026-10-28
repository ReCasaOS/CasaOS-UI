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
