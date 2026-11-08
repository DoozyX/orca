import { describe, expect, it } from 'vitest'
import { isGitGraphRefVisible, toggleGitGraphRefVisibility } from './git-graph-ref-visibility'

describe('toggleGitGraphRefVisibility', () => {
  const allRefIds = ['a', 'b', 'x']

  it('hides one ref under All and returns to All when it is shown again', () => {
    const hidden = toggleGitGraphRefVisibility({
      filter: 'all',
      allRefIds,
      refIds: ['x'],
      visible: false
    })
    expect(hidden).toEqual({ filter: ['a', 'b'] })
    expect(
      toggleGitGraphRefVisibility({
        filter: ['a', 'b'],
        allRefIds,
        refIds: ['x'],
        visible: true
      })
    ).toEqual({ filter: 'all' })
  })

  it('refuses a list longer than the history limit and keeps the filter', () => {
    const many = Array.from({ length: 1200 }, (_, index) => `ref-${index}`)
    expect(
      toggleGitGraphRefVisibility({
        filter: 'all',
        allRefIds: many,
        refIds: ['ref-0'],
        visible: false
      })
    ).toEqual({ error: 'too-many-refs' })
  })

  it('refuses to hide the last visible ref', () => {
    expect(
      toggleGitGraphRefVisibility({ filter: ['a'], allRefIds, refIds: ['a'], visible: false })
    ).toEqual({ error: 'last-visible' })
    expect(
      toggleGitGraphRefVisibility({
        filter: 'head',
        allRefIds,
        currentRefId: 'a',
        refIds: ['a'],
        visible: false
      })
    ).toEqual({ error: 'last-visible' })
  })

  it('expands the current-branch filter before adding a ref', () => {
    expect(
      toggleGitGraphRefVisibility({
        filter: 'head',
        allRefIds,
        currentRefId: 'a',
        refIds: ['x'],
        visible: true
      })
    ).toEqual({ filter: ['a', 'x'] })
  })
})

describe('toggleGitGraphRefVisibility with a partial ref list', () => {
  it('refuses to hide from All and never restores All from the known refs', () => {
    expect(toggleGitGraphRefVisibility({ filter: 'all', refIds: ['a'], visible: false })).toEqual({
      error: 'refs-incomplete'
    })
    expect(
      toggleGitGraphRefVisibility({ filter: ['a', 'b'], refIds: ['x'], visible: true })
    ).toEqual({ filter: ['a', 'b', 'x'] })
  })
})

describe('isGitGraphRefVisible', () => {
  it('reads each filter shape', () => {
    expect(isGitGraphRefVisible('all', 'a')).toBe(true)
    expect(isGitGraphRefVisible('head', 'a', 'a')).toBe(true)
    expect(isGitGraphRefVisible('head', 'b', 'a')).toBe(false)
    expect(isGitGraphRefVisible(['a'], 'b')).toBe(false)
  })
})
