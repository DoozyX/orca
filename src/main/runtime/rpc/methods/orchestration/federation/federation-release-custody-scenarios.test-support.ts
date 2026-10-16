import { expect, it } from 'vitest'
import type { RuntimeRpcResponse } from '../../../../../../shared/runtime-rpc-envelope'
import { ORCHESTRATION_CONTRACT_VERSION } from '../../../../../../shared/protocol-version'
import type { OrchestrationDb } from '../../../../orchestration/db'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import type { RpcRequest } from '../../../core'

type CustodyScenarioHarness = {
  startSettledRemoteWorker: () => Promise<string>
  dispatch: (request: RpcRequest) => Promise<RuntimeRpcResponse<unknown>>
  runtime: () => OrcaRuntimeService
  workerDb: () => OrchestrationDb
}

export function registerFederatedReleaseCustodyScenarios(harness: CustodyScenarioHarness): void {
  it('carries the execution host takeover evidence home on release and show', async () => {
    const dispatchId = await harness.startSettledRemoteWorker()
    const paneKey = harness.workerDb().getWorkerTerminalResourceByOwner(dispatchId)?.pane_key
    expect(paneKey).toEqual(expect.any(String))
    expect(
      harness
        .workerDb()
        .markWorkerTerminalUserOwned(paneKey ?? '', { source: 'remote_terminal_input' })
    ).toBe(1)
    const takeover = { source: 'remote_terminal_input', at: expect.any(String) }

    await expect(
      harness.dispatch({
        id: 'rpc_custody_release',
        authToken: 'coordinator-token',
        orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION,
        orchestrationRequestId: 'request_custody_release',
        method: 'orchestration.workerRelease',
        params: { dispatch: dispatchId }
      })
    ).resolves.toMatchObject({
      ok: true,
      result: {
        state: 'retained',
        reason: 'user_takeover',
        takeover,
        recovery: expect.stringContaining(`worker-show --dispatch ${dispatchId}`)
      }
    })
    await expect(
      harness.dispatch({
        id: 'rpc_custody_show',
        authToken: 'coordinator-token',
        method: 'orchestration.workerShow',
        params: { dispatch: dispatchId }
      })
    ).resolves.toMatchObject({
      ok: true,
      result: {
        terminalResource: { ownerDispatchId: dispatchId, ownershipState: 'user_owned', takeover }
      }
    })
    expect(harness.runtime().closeTerminal).not.toHaveBeenCalled()
  })
}
