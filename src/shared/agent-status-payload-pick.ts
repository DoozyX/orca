import type { ParsedAgentStatusPayload } from './agent-status-types'

/**
 * Narrow an `AgentStatusIpcPayload` (or any superset) down to the status fields alone.
 * Why: the IPC shape is flattened, so a spread cannot be narrowed structurally — copying
 * a hook row into a client-visible projection would otherwise ship `launchToken`,
 * `connectionId`, `promptInteractionKey` and `providerSessionOnly` to every paired client.
 */
export function pickParsedAgentStatusPayload(
  row: ParsedAgentStatusPayload
): ParsedAgentStatusPayload {
  return {
    state: row.state,
    ...(row.workingMode !== undefined ? { workingMode: row.workingMode } : {}),
    prompt: row.prompt,
    ...(row.agentType !== undefined ? { agentType: row.agentType } : {}),
    ...(row.model !== undefined ? { model: row.model } : {}),
    ...(row.modelSwitchCommand ? { modelSwitchCommand: row.modelSwitchCommand } : {}),
    ...(row.toolName !== undefined ? { toolName: row.toolName } : {}),
    ...(row.toolInput !== undefined ? { toolInput: row.toolInput } : {}),
    ...(row.interactivePrompt !== undefined ? { interactivePrompt: row.interactivePrompt } : {}),
    ...(row.lastAssistantMessage !== undefined
      ? { lastAssistantMessage: row.lastAssistantMessage }
      : {}),
    ...(row.lastAssistantMessageIsToolOutput !== undefined
      ? { lastAssistantMessageIsToolOutput: row.lastAssistantMessageIsToolOutput }
      : {}),
    ...(row.interrupted !== undefined ? { interrupted: row.interrupted } : {}),
    ...(row.sessionBoundary !== undefined ? { sessionBoundary: row.sessionBoundary } : {}),
    ...(row.turnCompletedAt !== undefined ? { turnCompletedAt: row.turnCompletedAt } : {}),
    ...(row.subagents !== undefined ? { subagents: row.subagents } : {}),
    ...(row.monitoredWork !== undefined ? { monitoredWork: row.monitoredWork } : {}),
    ...(row.mainAgent !== undefined ? { mainAgent: row.mainAgent } : {})
  }
}
