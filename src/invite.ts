const PARAM = 'invite'

/**
 * Reads the invite code from the page's address, then removes it from the address,
 * so it doesn't stay in the history or become the installed app's start page.
 */
export function takeInviteFromUrl(): string | null {
  const url = new URL(window.location.href)
  const code = url.searchParams.get(PARAM)?.trim() || null
  if (url.searchParams.has(PARAM)) {
    url.searchParams.delete(PARAM)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }
  return code
}

/** The link to send someone: this app, with the code filled in. */
export function inviteLink(code: string): string {
  return `${window.location.origin}/?${PARAM}=${encodeURIComponent(code)}`
}

/** A whole invite link pasted where the code goes works too. */
export function inviteCodeFrom(value: string): string {
  const trimmed = value.trim()
  try {
    return new URL(trimmed).searchParams.get(PARAM)?.trim() || trimmed
  } catch {
    return trimmed // Not a link: the code itself.
  }
}
