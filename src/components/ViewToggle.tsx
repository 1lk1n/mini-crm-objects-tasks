import { SegmentedControl } from '@mantine/core'
import type { ViewMode } from '../lib/viewMode'

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <SegmentedControl
      size="xs"
      value={value}
      onChange={(v) => onChange(v as ViewMode)}
      data={[
        { value: 'board', label: 'Доска' },
        { value: 'list', label: 'Список' },
      ]}
    />
  )
}
