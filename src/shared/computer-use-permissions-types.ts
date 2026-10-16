export type ComputerUsePermissionId = 'accessibility' | 'screenshots'

export type ComputerUsePermissionStatus = 'granted' | 'not-granted' | 'unsupported'

export type ComputerUsePermissionState = {
  id: ComputerUsePermissionId
  status: ComputerUsePermissionStatus
}

export type ComputerUsePermissionStatusResult = {
  platform: NodeJS.Platform
  helperAppPath: string | null
  helperUnavailableReason: string | null
  permissions: ComputerUsePermissionState[]
  /** The helper live computer-use calls run through; absent when none was observed. */
  liveProvider?: { executablePath: string; matchesCurrentHelper: boolean }
}

export type ComputerUsePermissionSetupResult = {
  platform: NodeJS.Platform
  helperAppPath: string | null
  permissionId?: ComputerUsePermissionId
  openedSettings: boolean
  launchedHelper: boolean
  permissions?: ComputerUsePermissionState[]
  nextStep?: string | null
}

export type ComputerUsePermissionResetResult = ComputerUsePermissionStatusResult & {
  bundleId: string | null
}
