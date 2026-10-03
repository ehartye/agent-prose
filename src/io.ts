/** Where commands send their JSON result: stdout in the CLI, an array in tests. */
export interface Io { emit(value: unknown): void }
