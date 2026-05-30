// Re-export from context — all consumers share one IPC listener via LcuProvider
export type { LcuState } from '../context/LcuContext'
export { useLcu } from '../context/LcuContext'
