import { wakelockSetParamsSchema } from '../mobile-web-shell/bridge/bridge-audio-verbs'

/**
 * The device side of `native.wakelock.set`, on the shell where `expo-keep-awake` exists.
 *
 * Dictation holds the screen awake from the moment recording starts until the transcript is back,
 * because a screen lock mid-processing suspends the app and loses it. On the page that tag has to
 * be asked for, which is this verb; natively the same seam calls `expo-keep-awake` directly.
 *
 * The shell tracks what it is holding so a page that releases a tag it never took asks the device
 * nothing: `deactivateKeepAwake` on an unheld tag is a native call whose failure would read to the
 * page as a wake lock it could not drop.
 */
export type WakelockDevice = {
  readonly activate: (tag: string) => Promise<void>
  readonly deactivate: (tag: string) => Promise<void>
}

export function createNativeWakelockServer(
  device: WakelockDevice
): (params: unknown) => Promise<{ active: boolean }> {
  const held = new Set<string>()
  return async (params) => {
    const { active, tag } = wakelockSetParamsSchema.parse(params)
    if (active) {
      await device.activate(tag)
      held.add(tag)
      return { active: true }
    }
    if (held.delete(tag)) {
      await device.deactivate(tag)
    }
    return { active: false }
  }
}
