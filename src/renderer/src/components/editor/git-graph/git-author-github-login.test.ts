import { describe, expect, it } from 'vitest'
import { gitHubLoginFromNoreplyEmail } from './git-author-github-login'

describe('gitHubLoginFromNoreplyEmail', () => {
  it('reads the login and user id from an id-prefixed noreply address', () => {
    expect(gitHubLoginFromNoreplyEmail('12345+octocat@users.noreply.github.com')).toEqual({
      login: 'octocat',
      userId: '12345'
    })
  })

  it('reads the login from a legacy noreply address, ignoring case', () => {
    expect(gitHubLoginFromNoreplyEmail('Octocat@Users.Noreply.GitHub.com')).toEqual({
      login: 'Octocat'
    })
  })

  it('returns null for a company email', () => {
    expect(gitHubLoginFromNoreplyEmail('jane@example.com')).toBeNull()
  })
})
