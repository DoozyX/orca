const NOREPLY_EMAIL = /^(?:(\d+)\+)?([^@+\s]+)@users\.noreply\.github\.com$/i

export function gitHubLoginFromNoreplyEmail(
  email: string | undefined
): { login: string; userId?: string } | null {
  const match = email ? NOREPLY_EMAIL.exec(email.trim()) : null
  if (!match) {
    return null
  }
  const [, userId, login] = match
  return userId ? { login: login!, userId } : { login: login! }
}
