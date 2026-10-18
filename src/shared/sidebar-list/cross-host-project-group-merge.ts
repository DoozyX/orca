import type { ProjectGroup } from '../project-group-types'
import {
  getProjectGroupExecutionHostId,
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../execution-host'
import type { Repo } from '../repo-types'
import { foldProjectGroupCopies, getIdsSharedAcrossHosts } from './project-group-copy-folding'

/** One sidebar row's worth of project group: the copy that owns the row plus
 *  every same-identity copy from another host folded into it. */
export type MergedProjectGroup = {
  primary: ProjectGroup
  members: readonly ProjectGroup[]
  /** What the sidebar keys its header, buckets and collapse state on: the primary's
   *  id, host-qualified only when a second merged row's primary reuses that id.
   *  Ownership and mutations keep routing through `primary`, never through this. */
  rowId: string
}

/** Merged rows plus the lookups that map a raw (host, id) pair back onto one. */
export type MergedProjectGroupIndex = {
  merged: readonly MergedProjectGroup[]
  byHostScopedKey: ReadonlyMap<string, MergedProjectGroup>
  /** Id-only fallback for callers with no host in hand. A null value marks an id
   *  that two hosts reuse for different merged rows, where guessing would be wrong. */
  byAmbiguousId: ReadonlyMap<string, MergedProjectGroup | null>
  byRowId: ReadonlyMap<string, MergedProjectGroup>
  /** Loop-free: a row absent here is drawn top-level. */
  drawnParentByRowId: ReadonlyMap<string, MergedProjectGroup>
}

/** Raw (host, id) lookup over the unmerged groups, for walks up a parent chain:
 *  parentGroupId is per-host, so a bare-id map can cross to another host's group. */
export type ProjectGroupHostIndex = {
  byHostScopedKey: ReadonlyMap<string, ProjectGroup>
  byAmbiguousId: ReadonlyMap<string, ProjectGroup | null>
}

function getHostScopedKey(group: ProjectGroup): string {
  return toHostScopedKey(getProjectGroupExecutionHostId(group), group.id)
}

export function toHostScopedKey(hostId: string, groupId: string): string {
  return `${hostId}\u0000${groupId}`
}

/** The local copy owns the row when there is one: its id keys collapse state and
 *  its host is where menu actions land without a round trip. */
function isPreferredPrimary(candidate: ProjectGroup, current: ProjectGroup): boolean {
  const candidateIsLocal = getProjectGroupExecutionHostId(candidate) === LOCAL_EXECUTION_HOST_ID
  const currentIsLocal = getProjectGroupExecutionHostId(current) === LOCAL_EXECUTION_HOST_ID
  if (candidateIsLocal !== currentIsLocal) {
    return candidateIsLocal
  }
  if (candidate.createdAt !== current.createdAt) {
    return candidate.createdAt < current.createdAt
  }
  return candidate.id < current.id
}

type MergedProjectGroupRow = Omit<MergedProjectGroup, 'rowId'>

/** A row id must survive two hosts reusing one group id for unrelated rows: both
 *  primaries would otherwise render under the same header key and share a bucket. */
function withMergedRowIds(rows: readonly MergedProjectGroupRow[]): MergedProjectGroup[] {
  const primaryIdCounts = new Map<string, number>()
  for (const row of rows) {
    primaryIdCounts.set(row.primary.id, (primaryIdCounts.get(row.primary.id) ?? 0) + 1)
  }
  return rows.map((row) => ({
    ...row,
    rowId:
      (primaryIdCounts.get(row.primary.id) ?? 0) > 1
        ? getHostScopedKey(row.primary)
        : row.primary.id
  }))
}

/**
 * Fold the per-host copies of one logical project group into a single row.
 *
 * Projects already merge across hosts (one row carrying a local and a paired-host
 * checkout), but their groups did not: the copy that lost the project rows stayed
 * behind as an identical, unfoldable header (#22022).
 *
 * Which copies fold is foldProjectGroupCopies' rule; only copies on *different*
 * hosts ever share a row.
 */
export function mergeProjectGroupsAcrossHosts(
  projectGroups: readonly ProjectGroup[]
): MergedProjectGroup[] {
  const sharedIds = getIdsSharedAcrossHosts(projectGroups)
  const merged: MergedProjectGroupRow[] = []
  for (const members of foldProjectGroupCopies(projectGroups)) {
    // Why the last shared-id copy: every id-keyed lookup resolves to it, so the drawn
    // name and parents match Cmd+J and reveal (#30045).
    let primary = members.findLast((member) => sharedIds.has(member.id))
    if (!primary) {
      primary = members[0]
      for (const member of members) {
        if (isPreferredPrimary(member, primary)) {
          primary = member
        }
      }
    }
    merged.push({ primary, members })
  }
  return withMergedRowIds(merged)
}

const mergedIndexCache = new WeakMap<object, MergedProjectGroupIndex>()

/** Memoized on the project-group array identity, the way the sidebar already
 *  memoizes its project grouping index. */
export function buildMergedProjectGroupIndex(
  projectGroups: readonly ProjectGroup[]
): MergedProjectGroupIndex {
  const cached = mergedIndexCache.get(projectGroups)
  if (cached) {
    return cached
  }
  const merged = mergeProjectGroupsAcrossHosts(projectGroups)
  const byHostScopedKey = new Map<string, MergedProjectGroup>()
  const byAmbiguousId = new Map<string, MergedProjectGroup | null>()
  const byRowId = new Map<string, MergedProjectGroup>()
  for (const entry of merged) {
    byRowId.set(entry.rowId, entry)
    for (const member of entry.members) {
      byHostScopedKey.set(getHostScopedKey(member), entry)
      const seen = byAmbiguousId.get(member.id)
      if (seen === undefined) {
        byAmbiguousId.set(member.id, entry)
      } else if (seen !== entry) {
        // Why: two hosts reusing one group id for different rows — no id-only answer is right.
        byAmbiguousId.set(member.id, null)
      }
    }
  }
  const drawnParentByRowId = new Map<string, MergedProjectGroup>()
  for (const entry of merged) {
    const parentId = entry.primary.parentGroupId
    const parent = parentId
      ? byHostScopedKey.get(
          toHostScopedKey(getProjectGroupExecutionHostId(entry.primary), parentId)
        )
      : undefined
    if (parent) {
      drawnParentByRowId.set(entry.rowId, parent)
    }
  }
  // Why: folded copies can disagree on parents, so drawn parents can loop across hosts;
  // a row on a loop is drawn top-level rather than not at all.
  const onLoop = merged.filter((entry) => {
    const seen = new Set<string>()
    let current = drawnParentByRowId.get(entry.rowId)
    while (current && !seen.has(current.rowId) && current !== entry) {
      seen.add(current.rowId)
      current = drawnParentByRowId.get(current.rowId)
    }
    return current === entry
  })
  for (const entry of onLoop) {
    drawnParentByRowId.delete(entry.rowId)
  }
  const index = { merged, byHostScopedKey, byAmbiguousId, byRowId, drawnParentByRowId }
  mergedIndexCache.set(projectGroups, index)
  return index
}

/** The row a merged row is drawn under: its primary's parent, top-level on a loop. */
export function getMergedProjectGroupParent(
  index: MergedProjectGroupIndex,
  row: MergedProjectGroup
): MergedProjectGroup | undefined {
  return index.drawnParentByRowId.get(row.rowId)
}

/** The rows from the top-level ancestor down to `row`, the headers that reveal opens. */
export function getMergedProjectGroupAncestry(
  index: MergedProjectGroupIndex,
  row: MergedProjectGroup
): MergedProjectGroup[] {
  const ancestry: MergedProjectGroup[] = []
  let current: MergedProjectGroup | undefined = row
  while (current) {
    ancestry.unshift(current)
    current = index.drawnParentByRowId.get(current.rowId)
  }
  return ancestry
}

/** The host a repo's `projectGroupId` is scoped to: its own stamp, else the catalog's host. */
export function getRepoProjectGroupHostId(
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined,
  defaultHostId: ExecutionHostId
): ExecutionHostId {
  return repo?.connectionId || repo?.executionHostId ? getRepoExecutionHostId(repo) : defaultHostId
}

/** The merged row a raw group id belongs to. Pass the owning host whenever it is
 *  known: ids are only unique per host. */
export function findMergedProjectGroup(
  index: MergedProjectGroupIndex,
  groupId: string,
  hostId?: ExecutionHostId
): MergedProjectGroup | undefined {
  // Why no id-only fallback here: a host-scoped miss means the *owning* host's copy
  // is not indexed, and another host's same-id group is a different group entirely.
  if (hostId !== undefined) {
    return index.byHostScopedKey.get(toHostScopedKey(hostId, groupId))
  }
  return index.byAmbiguousId.get(groupId) ?? undefined
}

/** Raw group id -> the row id the sidebar keys its header and collapse state on.
 *  Falls back to the raw id so callers stay correct for ids the index never saw. */
export function resolveMergedProjectGroupId(
  index: MergedProjectGroupIndex,
  groupId: string,
  hostId?: ExecutionHostId
): string {
  return findMergedProjectGroup(index, groupId, hostId)?.rowId ?? groupId
}

/** The merged row behind a rendered row key, which carries no host of its own. */
export function findMergedProjectGroupByRowId(
  index: MergedProjectGroupIndex,
  rowId: string
): MergedProjectGroup | undefined {
  return index.byRowId.get(rowId)
}

const hostIndexCache = new WeakMap<object, ProjectGroupHostIndex>()

/** Memoized on the project-group array identity, like the merged index above. */
export function buildProjectGroupHostIndex(
  projectGroups: readonly ProjectGroup[]
): ProjectGroupHostIndex {
  const cached = hostIndexCache.get(projectGroups)
  if (cached) {
    return cached
  }
  const byHostScopedKey = new Map<string, ProjectGroup>()
  const byAmbiguousId = new Map<string, ProjectGroup | null>()
  for (const group of projectGroups) {
    byHostScopedKey.set(getHostScopedKey(group), group)
    const seen = byAmbiguousId.get(group.id)
    if (seen === undefined) {
      byAmbiguousId.set(group.id, group)
    } else if (seen !== group) {
      byAmbiguousId.set(group.id, null)
    }
  }
  const index = { byHostScopedKey, byAmbiguousId }
  hostIndexCache.set(projectGroups, index)
  return index
}

/** Same host rule as findMergedProjectGroup: a known host never falls back to an id. */
export function findProjectGroupByHost(
  index: ProjectGroupHostIndex,
  groupId: string,
  hostId?: ExecutionHostId
): ProjectGroup | undefined {
  if (hostId !== undefined) {
    return index.byHostScopedKey.get(toHostScopedKey(hostId, groupId))
  }
  return index.byAmbiguousId.get(groupId) ?? undefined
}
