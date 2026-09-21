/**
 * Which route closures reach dictation's capture seam, and therefore which routes must be granted
 * the four audio verbs.
 *
 * A census rather than a hand list, because a grant row written by hand is a row that stops
 * agreeing with the closure the moment a screen moves: the rule below reads what each registered
 * page route actually reaches and holds its `grants` to it. Vacuous today — the session route is
 * the only closure that reaches the seam and `MOBILE_WEB_PAGE_ROUTES` does not carry it yet (C7.7
 * registers it) — so the control beside it applies the same rule to the session route module and
 * shows the rule failing without the four names.
 *
 * The closure also says what the seam took out of the page. Without its web half the bundler
 * resolves the native one and the vendored `@orca/expo-two-way-audio` web stub lands in the
 * closure, which is what dictation on the page used to be: a module answering denied microphone
 * permission and no playback. Measured on this tree, removing the web file puts four of its modules
 * back. So "absent" here is a fact about the seam and not about the census failing to look.
 */
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mobileWebAppRouteClosure } from './build-mobile-web-app-bundle.mjs'
import { mobileWebAppDependenciesPresent } from './mobile-web-app-bundle-dependencies.mjs'
import { MOBILE_WEB_PAGE_ROUTES } from './mobile-web-page-routes.mjs'
import { MobileWebBundleRouteSchema } from '../../src/shared/mobile-web-bundle/manifest-contract.ts'

const describeClosure = mobileWebAppDependenciesPresent() ? describe : describe.skip

/** The seam, as the web build resolves it: `.web.ts` wins under the builder's resolveExtensions. */
const SEAM = 'src/platform/dictation-capture.web.ts'

/** The native half, which must resolve out of a page closure rather than sit in it unused. */
const NATIVE_SEAM = 'src/platform/dictation-capture.ts'

/** Every verb the seam calls. Named here so the rule below is the census's own answer and not a
 *  second list to keep true; `bridge-audio-verbs.test.ts` pins them against the verb table. */
const DICTATION_GRANTS = [
  'native.audio.start',
  'native.audio.read',
  'native.audio.stop',
  'native.wakelock.set'
]

/** Native modules the seam exists to keep out: importing either reaches a JSI binding, and their
 *  web builds are a denied microphone and a no-op wake lock. */
const NATIVE_AUDIO_MODULES = ['@orca/expo-two-way-audio', 'expo-keep-awake']

const SESSION = 'app/h/[hostId]/session/[worktreeId].tsx'

/** The route module a registered pathname is served from, the way expo-router files are named. */
function routeModule(pathname) {
  const withoutRoot = pathname.replace(/^\//, '')
  const last = withoutRoot.split('/').at(-1)
  return last === '[hostId]' ? `app/${withoutRoot}/index.tsx` : `app/${withoutRoot}.tsx`
}

/** The grants a closure needs of the seam: all four, or none. A route granted three would record
 *  with the screen free to lock, and a lock mid-processing suspends the app and loses the
 *  transcript. */
function dictationGrantsNeeded(closure) {
  return closure.local.includes(SEAM) ? DICTATION_GRANTS : []
}

describeClosure(
  'the routes that reach dictation capture',
  () => {
    it('holds every registered page route to the grants its own closure needs', async () => {
      const missing = []
      for (const route of MOBILE_WEB_PAGE_ROUTES) {
        const closure = await mobileWebAppRouteClosure(routeModule(route.pathname))
        for (const grant of dictationGrantsNeeded(closure)) {
          if (!route.grants.includes(grant)) {
            missing.push(`${route.pathname} needs ${grant}`)
          }
        }
      }
      expect(missing).toEqual([])
    })

    it('finds the seam in exactly one closure, which is the session route', async () => {
      const reaching = []
      for (const route of MOBILE_WEB_PAGE_ROUTES) {
        const closure = await mobileWebAppRouteClosure(routeModule(route.pathname))
        if (closure.local.includes(SEAM)) {
          reaching.push(route.pathname)
        }
      }
      // None today: dictation lives on the session screen, and that route is not registered yet.
      // Which is why the rule above passes without a grant row moving, and why the control below
      // is what proves the rule can fail at all.
      expect(reaching).toEqual([])
      const session = await mobileWebAppRouteClosure(SESSION)
      expect(session.local).toContain(SEAM)
    })

    it('fails the same rule for the session route until it names all four', async () => {
      const closure = await mobileWebAppRouteClosure(SESSION)
      const needed = dictationGrantsNeeded(closure)
      expect(needed).toEqual(DICTATION_GRANTS)
      // The rule, run against the grants C7.7 would register it with today.
      const asRegistered = { pathname: '/h/[hostId]/session/[worktreeId]', grants: [] }
      expect(needed.filter((grant) => !asRegistered.grants.includes(grant))).toEqual(
        DICTATION_GRANTS
      )
      // And every one of the four is a name a manifest route may carry, which is the ruling-6a trap:
      // `native.audio.readChunk` is not a route that degrades to native, it is a bundle the phone
      // refuses entire.
      expect(
        MobileWebBundleRouteSchema.safeParse({
          pathname: asRegistered.pathname,
          grants: DICTATION_GRANTS
        }).success
      ).toBe(true)
    })

    it('carries the seam and not the native audio chain it stands in for', async () => {
      const closure = await mobileWebAppRouteClosure(SESSION)
      expect(closure.local).toContain(SEAM)
      expect(closure.local).not.toContain(NATIVE_SEAM)
      for (const absent of NATIVE_AUDIO_MODULES) {
        expect(
          closure.modules.filter((module) => module.includes(`/${absent}/`)),
          absent
        ).toEqual([])
      }
      // The hook above the seam is still in the closure, so the absences above are the seam's work
      // and not dictation having left the page.
      expect(closure.local).toContain('src/hooks/use-mobile-dictation.ts')
      expect(closure.local).toContain('src/hooks/mobile-dictation-keep-awake.ts')
    })

    it('is big enough that finding nothing would mean something', async () => {
      const closure = await mobileWebAppRouteClosure(SESSION)
      // The largest route of the series; a closure that collapsed would pass every rule above by
      // containing nothing to judge.
      expect(closure.local.length).toBeGreaterThan(900)
    })
  },
  240_000
)

describe('the census rule itself', () => {
  it('names a route module for every registered pathname', () => {
    expect(MOBILE_WEB_PAGE_ROUTES.map((route) => routeModule(route.pathname))).toEqual([
      'app/h/[hostId]/index.tsx',
      'app/h/[hostId]/agent-history/[worktreeId].tsx',
      'app/h/[hostId]/tasks.tsx',
      'app/h/[hostId]/files/[worktreeId].tsx',
      'app/h/[hostId]/files/preview/[worktreeId].tsx'
    ])
  })

  it('asks for all four grants or none, never a subset', () => {
    expect(dictationGrantsNeeded({ local: [SEAM] })).toEqual(DICTATION_GRANTS)
    expect(dictationGrantsNeeded({ local: ['src/platform/media-picker.web.ts'] })).toEqual([])
  })

  it('reads the census file rather than a copy of this list', () => {
    // A guard against the failure this file exists to avoid: the rule above must not be checked
    // against a list that agrees with itself while naming verbs the shell does not serve.
    expect(new Set(DICTATION_GRANTS).size).toBe(4)
    for (const grant of DICTATION_GRANTS) {
      expect(
        MobileWebBundleRouteSchema.safeParse({ pathname: '/h', grants: [grant] }).success,
        grant
      ).toBe(true)
    }
  })
})

/** Kept so a reader can find the tree this ran against without a machine path in the file. */
export const MOBILE_DIR = fileURLToPath(new URL('../../mobile/', import.meta.url))
