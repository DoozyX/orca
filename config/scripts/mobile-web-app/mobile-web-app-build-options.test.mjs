import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MOBILE_WEB_APP_SHIMS, mobileWebAppBuildOptions } from '../build-mobile-web-app-bundle.mjs'
import {
  ROUTE_SOURCE_LOADERS,
  collectMobileWebAppRoutes
} from './mobile-web-app-route-manifest.mjs'
import { mobileWebAppDependenciesPresent } from './mobile-web-app-bundle-dependencies.mjs'

const projectDir = fileURLToPath(new URL('../../..', import.meta.url))
const appDir = join(projectDir, 'mobile', 'app')

// Skipped where mobile dependencies are not installed, like the app bundle tests.
const describeBundling = mobileWebAppDependenciesPresent() ? describe : describe.skip

describeBundling('the app bundle build options', () => {
  it('asks esbuild for the split the budgets assume', async () => {
    const options = mobileWebAppBuildOptions(await collectMobileWebAppRoutes(appDir))
    // Each of these is load-bearing for a budget below: esm and splitting are what make a route a
    // chunk, and the metafile is the only thing that says which imports are static.
    expect(options.format).toBe('esm')
    expect(options.splitting).toBe(true)
    expect(options.chunkNames).toBe('[hash]')
    expect(options.metafile).toBe(true)
    expect(options.alias.react).toBe(join(projectDir, 'mobile', 'node_modules', 'react'))
  })

  it('reads a route source the same way the export guard does', async () => {
    const options = mobileWebAppBuildOptions(await collectMobileWebAppRoutes(appDir))
    // The guard parses each route on its own, outside this build. Sharing the table is what stops
    // a loader the bundle relies on from being missing there and reported as a syntax error.
    for (const [extension, loader] of Object.entries(ROUTE_SOURCE_LOADERS)) {
      expect(options.loader[extension], extension).toBe(loader)
    }
  })

  it('applies every shim it names', async () => {
    const options = mobileWebAppBuildOptions(await collectMobileWebAppRoutes(appDir))
    for (const shim of MOBILE_WEB_APP_SHIMS) {
      expect(shim.appliesTo(options), `${shim.name} is named but not applied`).toBe(true)
    }
  })

  it('fails the named shim, not the whole build, when its option goes missing', async () => {
    const options = mobileWebAppBuildOptions(await collectMobileWebAppRoutes(appDir))
    // Each shim reads an option of its own (two read `banner.js`), so stripping every option
    // leaves none applying. Without that, the list could name a shim the build stopped applying.
    const stripped = {
      ...options,
      alias: {},
      loader: {},
      define: {},
      banner: {},
      plugins: []
    }
    expect(MOBILE_WEB_APP_SHIMS.filter((shim) => shim.appliesTo(stripped))).toEqual([])
  })
})
