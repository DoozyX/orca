import type { ProjectGroup } from '../project-group-types'
import { getProjectGroupExecutionHostId, type ExecutionHostId } from '../execution-host'

/** Union-find over project-group copies; a set never holds two copies from one host. */
class ProjectGroupCopySets {
  private readonly parent: number[]
  private readonly hosts: Set<ExecutionHostId>[]

  constructor(projectGroups: readonly ProjectGroup[]) {
    this.parent = projectGroups.map((_, index) => index)
    this.hosts = projectGroups.map((group) => new Set([getProjectGroupExecutionHostId(group)]))
  }

  find(index: number): number {
    let root = index
    while (this.parent[root] !== root) {
      root = this.parent[root]
    }
    while (this.parent[index] !== root) {
      const next = this.parent[index]
      this.parent[index] = root
      index = next
    }
    return root
  }

  /** False when already joined or when both sets hold a copy from one host. */
  union(left: number, right: number): boolean {
    const leftRoot = this.find(left)
    const rightRoot = this.find(right)
    if (leftRoot === rightRoot) {
      return false
    }
    const leftHosts = this.hosts[leftRoot]
    const rightHosts = this.hosts[rightRoot]
    for (const hostId of rightHosts) {
      if (leftHosts.has(hostId)) {
        return false
      }
    }
    const [root, child] = leftRoot < rightRoot ? [leftRoot, rightRoot] : [rightRoot, leftRoot]
    this.parent[child] = root
    for (const hostId of this.hosts[child]) {
      this.hosts[root].add(hostId)
    }
    return true
  }
}

/** Ids more than one host publishes; their copies are one group however they are named. */
export function getIdsSharedAcrossHosts(projectGroups: readonly ProjectGroup[]): Set<string> {
  const hostById = new Map<string, ExecutionHostId>()
  const shared = new Set<string>()
  for (const group of projectGroups) {
    const hostId = getProjectGroupExecutionHostId(group)
    const seen = hostById.get(group.id)
    if (seen === undefined) {
      hostById.set(group.id, hostId)
    } else if (seen !== hostId) {
      shared.add(group.id)
    }
  }
  return shared
}

function claimedTwiceByOneHost(members: readonly number[], groups: readonly ProjectGroup[]) {
  const hostIds = new Set<ExecutionHostId>()
  for (const member of members) {
    const hostId = getProjectGroupExecutionHostId(groups[member])
    if (hostIds.has(hostId)) {
      return true
    }
    hostIds.add(hostId)
  }
  return false
}

/**
 * The per-host copies of each logical group, in first-seen order. Copies of an id that
 * several hosts publish are one group (a project moved to a managed server keeps the
 * desktop's copy under the same id, #30045); otherwise copies on different hosts fold
 * when they share a name and their parents fold, so a name match reaches a shared-id
 * group too (#22022). A name any one host uses twice among siblings stays unfolded:
 * those are two real groups.
 */
export function foldProjectGroupCopies(projectGroups: readonly ProjectGroup[]): ProjectGroup[][] {
  const sets = new ProjectGroupCopySets(projectGroups)
  const indexByHostScopedKey = new Map<string, number>()
  const firstIndexById = new Map<string, number>()
  const sharedIds = getIdsSharedAcrossHosts(projectGroups)
  projectGroups.forEach((group, index) => {
    indexByHostScopedKey.set(`${getProjectGroupExecutionHostId(group)}\u0000${group.id}`, index)
    const first = firstIndexById.get(group.id)
    if (first === undefined) {
      firstIndexById.set(group.id, index)
    } else if (sharedIds.has(group.id)) {
      sets.union(first, index)
    }
  })
  const parentIndexes = projectGroups.map((group) =>
    group.parentGroupId
      ? indexByHostScopedKey.get(
          `${getProjectGroupExecutionHostId(group)}\u0000${group.parentGroupId}`
        )
      : undefined
  )
  // Why repeated: a name match is keyed on the parent's set, which a later fold can join.
  let changed = true
  while (changed) {
    changed = false
    const membersByKey = new Map<string, number[]>()
    projectGroups.forEach((group, index) => {
      const parentIndex = parentIndexes[index]
      const parentKey = parentIndex === undefined ? 'root' : String(sets.find(parentIndex))
      const key = `${parentKey}\u0000${group.name.trim().toLowerCase()}`
      const members = membersByKey.get(key)
      if (members) {
        members.push(index)
      } else {
        membersByKey.set(key, [index])
      }
    })
    for (const members of membersByKey.values()) {
      if (members.length < 2 || claimedTwiceByOneHost(members, projectGroups)) {
        continue
      }
      for (const member of members.slice(1)) {
        changed = sets.union(members[0], member) || changed
      }
    }
  }
  const membersByRoot = new Map<number, ProjectGroup[]>()
  projectGroups.forEach((group, index) => {
    const root = sets.find(index)
    const members = membersByRoot.get(root)
    if (members) {
      members.push(group)
    } else {
      membersByRoot.set(root, [group])
    }
  })
  return [...membersByRoot.values()]
}
