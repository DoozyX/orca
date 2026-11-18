import type { PendingCreationRef } from './row-types'

export function groupPendingCreationsByRepo(
  pendingCreations: readonly PendingCreationRef[]
): Map<string, PendingCreationRef[]> {
  const pendingByRepo = new Map<string, PendingCreationRef[]>()
  for (const creation of pendingCreations) {
    const list = pendingByRepo.get(creation.repoId) ?? []
    list.push(creation)
    pendingByRepo.set(creation.repoId, list)
  }
  return pendingByRepo
}
