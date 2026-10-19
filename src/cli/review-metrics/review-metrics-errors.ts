export class ReviewMetricsRunDirError extends Error {
  constructor(
    readonly runDir: string,
    reason: string
  ) {
    super(`Cannot read run directory ${runDir}: ${reason}`)
    this.name = 'ReviewMetricsRunDirError'
  }
}

export class ReviewMetricsReadError extends Error {
  constructor(
    readonly path: string,
    reason: string
  ) {
    super(`Cannot read ${path}: ${reason}`)
    this.name = 'ReviewMetricsReadError'
  }
}
