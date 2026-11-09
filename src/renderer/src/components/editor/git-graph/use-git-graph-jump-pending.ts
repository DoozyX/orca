import { useRef, useState } from 'react'

async function settleJump(jump: () => Promise<unknown>, clear: () => void): Promise<void> {
  try {
    await jump()
  } finally {
    clear()
  }
}

/** Tracks the row of the newest running jump; an older jump finishing never clears a newer row. */
export function useGitGraphJumpPending() {
  const [pendingRefId, setPendingRefId] = useState<string>()
  const latest = useRef(0)
  const runJump = async (refId: string, jump: () => Promise<unknown>): Promise<void> => {
    const mine = ++latest.current
    setPendingRefId(refId)
    await settleJump(jump, () => {
      if (latest.current === mine) {
        setPendingRefId(undefined)
      }
    })
  }
  return { pendingRefId, runJump }
}
