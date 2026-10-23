// Cleaning values that people paste into a host's settings page.

const GOOGLE_ID = /[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com/i

/**
 * A Google client ID looks like 123456-abc.apps.googleusercontent.com. A line break, space or
 * extra letter pasted after it (it happened once) makes Google say "client ID not found", so
 * take just the ID out of whatever was pasted. Returns '' when there isn't one.
 */
export const cleanGoogleClientId = (raw) => String(raw ?? '').match(GOOGLE_ID)?.[0] ?? ''
