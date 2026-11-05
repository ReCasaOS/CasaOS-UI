// Who may open a share, as [{ username, read_only }]. A box running an older
// CasaOS sends only the one account a share had, which could always write;
// a guest share has nobody.
export function shareMembers(share) {
	if (Array.isArray(share.members)) {
		return share.members.map(m => ({ username: m.username, read_only: !!m.read_only }))
	}

	return share.username ? [{ username: share.username, read_only: false }] : []
}
