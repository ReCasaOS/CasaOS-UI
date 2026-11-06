// Who may open a share, as [{ username, read_only }]. A box running an older
// CasaOS sends only the one account a share had, which could always write;
// a guest share has nobody.
export function shareMembers(share) {
	if (Array.isArray(share.members)) {
		return share.members.map(m => ({ username: m.username, read_only: !!m.read_only }))
	}

	return share.username ? [{ username: share.username, read_only: false }] : []
}

// The one account a CasaOS without members reads from a request: a member who
// can write, else the first. Sent next to members, it keeps a protected share
// protected on such a box, which takes a share without username for a guest
// one open to anybody; a core that knows members ignores it.
export function legacyUsername(members) {
	const writer = members.find(m => !m.read_only)
	return (writer || members[0] || {}).username || ''
}

// The folders of /DATA never offered as a new share: AppData holds the apps'
// data and secrets.
export const NEVER_OFFERED = ['/DATA/AppData']
