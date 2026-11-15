// A page on a tab of its own has no top bar to ask who the account is: it asks the server, as the top bar does, and the
// store follows the answer. No answer leaves the role stored at sign-in, unconfirmed.
export async function confirmRole(api, store) {
	try {
		const user = (await api.users.getUserInfo()).data.data
		store.commit('SET_USER', user)
		localStorage.setItem('user', JSON.stringify(user))
	} catch (error) {
		console.error(error)
	}
}

// the role and the modules it reads, as one value: a page keyed by it is drawn again when the server's answer changes them
export const accessOf = getters => [getters.canWrite, ...['storage', 'vm', 'backups', 'fleet', 'system'].filter(name => getters.canReadModule(name))].join(':')
