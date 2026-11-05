import { useState } from 'react'

export type ViewMode = 'board' | 'list'

const KEY = 'crm.taskView'

function read(): ViewMode {
  try {
    return localStorage.getItem(KEY) === 'list' ? 'list' : 'board'
  } catch {
    return 'board'
  }
}

/** Board/list preference, remembered in this browser only (a convenience, not data). */
export function useViewMode() {
  const [mode, setMode] = useState<ViewMode>(read)
  const update = (m: ViewMode) => {
    setMode(m)
    try {
      localStorage.setItem(KEY, m)
    } catch {
      // storage unavailable (private mode etc.): keep the in-memory value
    }
  }
  return [mode, update] as const
}
