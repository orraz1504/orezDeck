import { applyUpdate, useUpdateAvailable } from '../lib/sw'

/** Small chip at the bottom when a new version of the app has been downloaded. */
export function UpdateChip() {
  const available = useUpdateAvailable()
  if (!available) return null
  return (
    <button type="button" className="update-chip" onClick={applyUpdate}>
      גרסה חדשה מוכנה · <b>רענון</b>
    </button>
  )
}
