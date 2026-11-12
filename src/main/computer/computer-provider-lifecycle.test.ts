import { describe, expect, it, vi } from 'vitest'
import { ComputerProviderLifecycle } from './computer-provider-lifecycle'
import { MacOSNativeProviderClient } from './macos-native/macos-native-provider-client'

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
})
