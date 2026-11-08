import { GitHubUserAvatar } from '@/components/github/github-user-avatar'
import { graphColor } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import type { GitHistoryGraphColorId } from '../../../../../shared/git/history/git-history-types'
import { gitHubLoginFromNoreplyEmail } from './git-author-github-login'

function authorInitials(name: string | undefined): string {
  const initials = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word].find((ch) => /[\p{L}\p{N}]/u.test(ch)) ?? '')
    .join('')
  return initials.toUpperCase() || '?'
}

export function GitAuthorAvatar({
  name,
  email,
  size,
  ringColor
}: {
  name?: string
  email?: string
  size: number
  ringColor?: GitHistoryGraphColorId
}): React.JSX.Element {
  const login = gitHubLoginFromNoreplyEmail(email)?.login
  return (
    <span
      aria-hidden
      title={name}
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[8px] font-semibold text-muted-foreground"
      style={{
        width: size,
        height: size,
        ...(ringColor ? { boxShadow: `0 0 0 1.5px ${graphColor(ringColor)}` } : {})
      }}
    >
      {login ? (
        <GitHubUserAvatar login={login} name={name} className="size-full border-0 text-[8px]" />
      ) : (
        authorInitials(name)
      )}
    </span>
  )
}
