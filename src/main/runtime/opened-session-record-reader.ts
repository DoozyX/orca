import {
  conversationRecordReader,
  readAgentSessionRecordStore,
  type AgentSessionRecordReader
} from './orchestration/structured-session-lineage'
import { peekOpenedAgentSessionRecordStore } from './agent-session-record-store-slot'

/** The installed host's records, else the store this process already opened; never opens one. */
export function openedSessionRecordReader(): AgentSessionRecordReader | null {
  const opened = peekOpenedAgentSessionRecordStore()
  return readAgentSessionRecordStore() ?? (opened ? conversationRecordReader(opened) : null)
}
