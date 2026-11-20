import { app } from 'electron'

// Must match keychain-access-groups in config/scripts/desktop-distribution/macos/mac-touch-id-webauthn.cjs.
const TOUCH_ID_KEYCHAIN_ACCESS_GROUP = 'N59WC8BU7V.com.stablyai.orca.webauthn'

/** Lets browser pages create and use Touch ID passkeys; only packaged builds carry the keychain entitlement. */
export function configureBrowserTouchIdWebAuthn(): void {
  if (process.platform !== 'darwin' || !app.isPackaged) {
    return
  }
  app.configureWebAuthn({ touchID: { keychainAccessGroup: TOUCH_ID_KEYCHAIN_ACCESS_GROUP } })
}
