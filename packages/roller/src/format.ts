export interface RestoreFailure {
  path: string
  operation: 'write' | 'delete'
  message: string
}

export interface RestoreReport {
  seq: number
  turn: number
  written: readonly string[]
  deleted: readonly string[]
  failed: readonly RestoreFailure[]
}

function paths(heading: string, values: readonly string[]): string[] {
  return [heading, ...(values.length === 0 ? ['- none'] : values.map(value => `- ${value}`))]
}

/** Stable command/done text rendered by every DSH command surface. */
export function formatRestoreReport(report: RestoreReport): string {
  return [
    report.seq === 0
      ? 'Restored files to session start.'
      : `Restored files to turn/end ${report.seq} (turn ${report.turn}).`,
    ...paths(`Written (${report.written.length}):`, report.written),
    ...paths(`Deleted (${report.deleted.length}):`, report.deleted),
    `Failed (${report.failed.length}):`,
    ...(report.failed.length === 0
      ? ['- none']
      : report.failed.map(failure =>
          `- ${failure.path}: ${failure.operation}: ${failure.message}`)),
  ].join('\n')
}
