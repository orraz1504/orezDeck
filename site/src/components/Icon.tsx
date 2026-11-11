/** Icons drawn in the design (1.8 stroke, 24 viewBox). */
const paths = {
  close: <path d="M6 6l12 12M18 6L6 18" />,
  /** "Back" in RTL points right. */
  back: <path d="M9 6l6 6-6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  upload: <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  rect: <rect x="4" y="7" width="16" height="10" rx="2" />,
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" />
    </>
  ),
  paste: (
    <>
      <rect x="6" y="5" width="12" height="15" rx="2" />
      <path d="M9 5V3.5h6V5" />
    </>
  ),
  dots: null,
} as const

export type IconName = keyof typeof paths

export function Icon({ name, size = 22, stroke = 1.8 }: { name: IconName; size?: number; stroke?: number }) {
  if (name === 'dots') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <circle cx="5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
      </svg>
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  )
}
