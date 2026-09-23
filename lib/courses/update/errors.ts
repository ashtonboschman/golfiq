export class ReconciliationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ReconciliationError';
  }
}

export class StaleReconciliationError extends ReconciliationError {
  constructor(message: string) {
    super(message, 409, 'stale_comparison');
  }
}
