import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../../../shared/execution-host'
import { getProjectGroupHostId } from '../../../../store/slices/project-group-owner-routing'

/** One sidebar row's worth of project group: the copy that owns the row plus
 *  every same-identity copy from another host folded into it. */
export type MergedProjectGroup = {
  primary: ProjectGroup
  members: readonly ProjectGroup[]
}

function getHostScopedKey(group: ProjectGroup): string {
  return `${getProjectGroupHostId(group)}\u0000${group.id}`
}

/** Identity shared by the copies of one logical group across hosts: the chain of
 *  normalized names up to the root. Ids and parentPath are per-host, names are not. */
function getCrossHostIdentity(
  group: ProjectGroup,
  byHostScopedKey: ReadonlyMap<string, ProjectGroup>,
  cache: Map<string, string>,
  resolving: Set<string>
): string {
  const key = getHostScopedKey(group)
  const cached = cache.get(key)
  if (cached !== undefined) {
    return cached
  }
  const name = group.name.trim().toLowerCase()
  // Why: a cyclic parent chain would recurse forever; fall back to the row's own id.
  if (resolving.has(key)) {
    return `\u0001cycle:${key}/${name}`
  }
  resolving.add(key)
  const parent = group.parentGroupId
    ? byHostScopedKey.get(`${getProjectGroupHostId(group)}\u0000${group.parentGroupId}`)
    : undefined
  const parentIdentity = parent
    ? getCrossHostIdentity(parent, byHostScopedKey, cache, resolving)
    : ''
  resolving.delete(key)
  const identity = `${parentIdentity}/${name}`
  cache.set(key, identity)
  return identity
}

/** The local copy owns the row when there is one: its id keys collapse state and
 *  its host is where menu actions land without a round trip. */
function isPreferredPrimary(candidate: ProjectGroup, current: ProjectGroup): boolean {
  const candidateIsLocal = getProjectGroupHostId(candidate) === LOCAL_EXECUTION_HOST_ID
  const currentIsLocal = getProjectGroupHostId(current) === LOCAL_EXECUTION_HOST_ID
  if (candidateIsLocal !== currentIsLocal) {
    return candidateIsLocal
  }
  if (candidate.createdAt !== current.createdAt) {
    return candidate.createdAt < current.createdAt
  }
  return candidate.id < current.id
}

/**
 * Fold the per-host copies of one logical project group into a single row.
 *
 * Projects already merge across hosts (one row carrying a local and a paired-host
 * checkout), but their groups did not: the copy that lost the project rows stayed
 * behind as an identical, unfoldable header (#22022).
 */
export function mergeProjectGroupsAcrossHosts(
  projectGroups: readonly ProjectGroup[]
): MergedProjectGroup[] {
  const byHostScopedKey = new Map(projectGroups.map((group) => [getHostScopedKey(group), group]))
  const identityCache = new Map<string, string>()
  const mergedByIdentity = new Map<string, { primary: ProjectGroup; members: ProjectGroup[] }>()
  for (const group of projectGroups) {
    const identity = getCrossHostIdentity(group, byHostScopedKey, identityCache, new Set())
    const existing = mergedByIdentity.get(identity)
    if (!existing) {
      mergedByIdentity.set(identity, { primary: group, members: [group] })
      continue
    }
    existing.members.push(group)
    if (isPreferredPrimary(group, existing.primary)) {
      existing.primary = group
    }
  }
  return [...mergedByIdentity.values()]
}

/** Group id (from any host) -> the merged row it renders in. */
export function buildMergedProjectGroupLookup(
  merged: readonly MergedProjectGroup[]
): ReadonlyMap<string, MergedProjectGroup> {
  const lookup = new Map<string, MergedProjectGroup>()
  for (const entry of merged) {
    for (const member of entry.members) {
      lookup.set(member.id, entry)
    }
  }
  return lookup
}
