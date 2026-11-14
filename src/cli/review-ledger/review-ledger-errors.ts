export class ReviewLedgerRefusedError extends Error {
  constructor(
    readonly unit: string,
    reason: string
  ) {
    super(`Ledger refused for unit ${unit}: ${reason}`)
    this.name = 'ReviewLedgerRefusedError'
  }
}

export class ReviewLedgerFileError extends Error {
  constructor(
    readonly path: string,
    reason: string
  ) {
    super(`${path}: ${reason}`)
    this.name = 'ReviewLedgerFileError'
  }
}
