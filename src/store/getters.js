// Only the exact role "admin" is the admin: a missing or unknown role is not, and behaves as an account of role `user`
// with no rights (no write control, no module) until the role is known.
const getters = {
	isAdmin: state => state.user?.role === 'admin',
	// every control that writes anything outside the account
	canWrite: state => state.user?.role === 'admin',
	// a module the account may read: the admin all of them, a user those of its rights (storage, vm, backups, fleet, system),
	// and files once it is given at least one folder (CasaOS#168); share and any other name are the admin's only
	canReadModule: state => name => state.user?.role === 'admin' || (state.user?.role === 'user' && (name === 'files'
		? Array.isArray(state.user.folders) && state.user.folders.length > 0
		: Array.isArray(state.user.rights) && state.user.rights.includes(name))),
}
export default getters
