const { execFileSync } = require('node:child_process')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { dirname } = require('node:path')

// Fork-only: Touch ID passkeys need a keychain group under the team that signs the app.
const MAC_TOUCH_ID_TEAM_ID = 'N59WC8BU7V'
const MAC_PROVISIONING_PROFILE_ENV = 'ORCA_MAC_PROVISIONING_PROFILE'

class MacTouchIdWebAuthnConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MacTouchIdWebAuthnConfigError'
  }
}

function macTouchIdKeychainAccessGroup(appId) {
  return `${MAC_TOUCH_ID_TEAM_ID}.${appId}.webauthn`
}

/** Main-app entitlements: the shared set plus the profile-backed keychain group; helpers keep the shared set. */
function writeMacTouchIdEntitlements(basePlistPath, outputPath, appId) {
  const base = readFileSync(basePlistPath, 'utf8')
  const closing = base.lastIndexOf('</dict>')
  if (closing === -1) {
    throw new MacTouchIdWebAuthnConfigError(`No top-level </dict> in ${basePlistPath}`)
  }
  const additions = [
    '\t<key>com.apple.application-identifier</key>',
    `\t<string>${MAC_TOUCH_ID_TEAM_ID}.${appId}</string>`,
    '\t<key>com.apple.developer.team-identifier</key>',
    `\t<string>${MAC_TOUCH_ID_TEAM_ID}</string>`,
    '\t<key>keychain-access-groups</key>',
    '\t<array>',
    `\t\t<string>${macTouchIdKeychainAccessGroup(appId)}</string>`,
    '\t</array>',
    ''
  ].join('\n')
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, base.slice(0, closing) + additions + base.slice(closing))
  return outputPath
}

/** Throws unless the profile authorizes this app id and keychain group for the fork's team. */
function assertMacTouchIdProvisioningProfile(appId) {
  const profilePath = process.env[MAC_PROVISIONING_PROFILE_ENV]
  if (!profilePath) {
    throw new MacTouchIdWebAuthnConfigError(
      `${MAC_PROVISIONING_PROFILE_ENV} must point at a Developer ID provisioning profile for ${MAC_TOUCH_ID_TEAM_ID}.${appId} (Touch ID passkeys need it).`
    )
  }
  if (!existsSync(profilePath)) {
    throw new MacTouchIdWebAuthnConfigError(
      `${MAC_PROVISIONING_PROFILE_ENV} points at a missing file: ${profilePath}`
    )
  }
  const decoded = execFileSync('security', ['cms', '-D', '-i', profilePath], { encoding: 'utf8' })
  // The profile holds <data>/<date> values JSON can't encode, so extract only what we check.
  const extract = (keyPath, format) =>
    execFileSync('plutil', ['-extract', keyPath, format, '-o', '-', '-'], {
      input: decoded,
      encoding: 'utf8'
    })
  const entitlements = JSON.parse(extract('Entitlements', 'json'))
  const expirationDate = extract('ExpirationDate', 'raw').trim()
  const expectedAppIdentifier = `${MAC_TOUCH_ID_TEAM_ID}.${appId}`
  if (entitlements['com.apple.application-identifier'] !== expectedAppIdentifier) {
    throw new MacTouchIdWebAuthnConfigError(
      `Provisioning profile ${profilePath} is for ${entitlements['com.apple.application-identifier']}, not ${expectedAppIdentifier}.`
    )
  }
  const groups = entitlements['keychain-access-groups'] ?? []
  const group = macTouchIdKeychainAccessGroup(appId)
  const covered = groups.some(
    (allowed) => allowed === group || allowed === `${MAC_TOUCH_ID_TEAM_ID}.*`
  )
  if (!covered) {
    throw new MacTouchIdWebAuthnConfigError(
      `Provisioning profile ${profilePath} does not allow keychain group ${group}.`
    )
  }
  if (new Date(expirationDate) <= new Date()) {
    throw new MacTouchIdWebAuthnConfigError(
      `Provisioning profile ${profilePath} expired on ${expirationDate}.`
    )
  }
  return profilePath
}

module.exports = {
  MAC_PROVISIONING_PROFILE_ENV,
  assertMacTouchIdProvisioningProfile,
  writeMacTouchIdEntitlements
}
