import { useRef, useState } from 'react'

/** Tracks the row of the newest running jump; an older jump finishing never clears a newer row. */
export function useGitGraphJumpPending() {
  const [pendingRefId, setPendingRefId] = useState<string>()
  const latest = useRef(0)
  const runJump = async (refId: string, jump: () => Promise<unknown>): Promise<void> => {
    const mine = ++latest.current
    setPendingRefId(refId)
    try {
      await jump()
    } finally {
      if (latest.current === mine) {
        setPendingRefId(undefined)
      }
    }
  }
  return { pendingRefId, runJump }
}
