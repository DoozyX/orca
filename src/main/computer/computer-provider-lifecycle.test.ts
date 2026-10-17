import { describe, expect, it, vi } from 'vitest'
import { ComputerProviderLifecycle } from './computer-provider-lifecycle'
import { MacOSNativeProviderClient } from './macos-native-provider-client'

function provider(name: string) {
  return {
    name,
    capabilities: vi.fn(),
    listApps: vi.fn(),
    listWindows: vi.fn(),
    snapshot: vi.fn(),
    action: vi.fn(),
    shutdown: vi.fn()
  }
}

describe('ComputerProviderLifecycle', () => {
  // #14: a status peek must never create a provider, which would start a helper just to look.
  it('peeks the live helper identity without creating a provider', () => {
    const identity = { executablePath: '/helper', dev: 1, ino: 2, mtimeMs: 3 }
    // A real, never-started client with its observers stubbed, so the factory type-checks uncast.
    const macProvider = new MacOSNativeProviderClient()
    vi.spyOn(macProvider, 'liveHelperIdentity').mockReturnValue(identity)
    vi.spyOn(macProvider, 'shutdown').mockImplementation(() => {})
    const createMacOSNativeProvider = vi.fn(() => macProvider)
    const createDesktopScriptProvider = vi.fn()
    const lifecycle = new ComputerProviderLifecycle({
      shouldUseMacOSNativeProvider: vi.fn(() => true),
      createMacOSNativeProvider,
      shouldUseDesktopScriptProvider: vi.fn(() => true),
      createDesktopScriptProvider
    })

    expect(lifecycle.peekLiveHelperIdentity()).toBeNull()
    expect(createMacOSNativeProvider).not.toHaveBeenCalled()
    expect(createDesktopScriptProvider).not.toHaveBeenCalled()

    lifecycle.current('darwin')
    expect(lifecycle.peekLiveHelperIdentity()).toEqual(identity)

    lifecycle.shutdown()
    expect(lifecycle.peekLiveHelperIdentity()).toBeNull()
  })

  it('rechecks macOS provider availability after an initial miss', () => {
    const macProvider = provider('mac')
    const shouldUseMacOSNativeProvider = vi.fn().mockReturnValueOnce(false).mockReturnValue(true)
    const lifecycle = new ComputerProviderLifecycle({
      shouldUseMacOSNativeProvider,
      createMacOSNativeProvider: vi.fn(() => macProvider as never),
      shouldUseDesktopScriptProvider: vi.fn(() => false),
      createDesktopScriptProvider: vi.fn()
    })

    expect(lifecycle.current('darwin')).toBeNull()
    expect(lifecycle.current('darwin')).toBe(macProvider)
    expect(shouldUseMacOSNativeProvider).toHaveBeenCalledTimes(2)
  })

  it('caches an available provider and shuts it down', () => {
    const macProvider = provider('mac')
    const createMacOSNativeProvider = vi.fn(() => macProvider as never)
    const lifecycle = new ComputerProviderLifecycle({
      shouldUseMacOSNativeProvider: vi.fn(() => true),
      createMacOSNativeProvider,
      shouldUseDesktopScriptProvider: vi.fn(() => false),
      createDesktopScriptProvider: vi.fn()
    })

    expect(lifecycle.current('darwin')).toBe(macProvider)
    expect(lifecycle.current('darwin')).toBe(macProvider)
    expect(createMacOSNativeProvider).toHaveBeenCalledTimes(1)

    lifecycle.shutdown()

    expect(macProvider.shutdown).toHaveBeenCalledTimes(1)
  })

  it('uses the desktop script provider on Linux when available', () => {
    const desktopProvider = provider('desktop')
    const lifecycle = new ComputerProviderLifecycle({
      shouldUseMacOSNativeProvider: vi.fn(() => false),
      createMacOSNativeProvider: vi.fn(),
      shouldUseDesktopScriptProvider: vi.fn(() => true),
      createDesktopScriptProvider: vi.fn(() => desktopProvider as never)
    })

    expect(lifecycle.current('linux')).toBe(desktopProvider)
  })

  it('shuts down the desktop script provider', () => {
    const desktopProvider = provider('desktop')
    const lifecycle = new ComputerProviderLifecycle({
      shouldUseMacOSNativeProvider: vi.fn(() => false),
      createMacOSNativeProvider: vi.fn(),
      shouldUseDesktopScriptProvider: vi.fn(() => true),
      createDesktopScriptProvider: vi.fn(() => desktopProvider as never)
    })

    expect(lifecycle.current('linux')).toBe(desktopProvider)

    lifecycle.shutdown()

    expect(desktopProvider.shutdown).toHaveBeenCalledTimes(1)
  })
})
