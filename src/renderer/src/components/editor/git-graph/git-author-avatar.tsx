import { GitHubUserAvatar, initialsFor } from '@/components/github/github-user-avatar'
import type { GitHistoryGraphColorId } from '../../../../../shared/git/history/git-history-types'
import { gitHubLoginFromNoreplyEmail } from './git-author-github-login'

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
      data-author-avatar
      title={name}
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[8px] font-semibold text-muted-foreground"
      style={{
        width: size,
        height: size,
        ...(ringColor ? { boxShadow: `0 0 0 1.5px var(--${ringColor})` } : {})
      }}
    >
      {login ? (
        <GitHubUserAvatar login={login} name={name} className="size-full border-0 text-[8px]" />
      ) : (
        initialsFor('', name)
      )}
    </span>
  )
}
