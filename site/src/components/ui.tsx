import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import logoGlyph from '../assets/logo-glyph.png'
import { initials } from '../lib/format'
import { pct } from '../lib/stats'
import { CARD_TYPE_LABEL, type CardType } from '../lib/types'
import { Icon, type IconName } from './Icon'

/* ─────────── Button ─────────── */

type Variant = 'primary' | 'secondary' | 'soft' | 'quiet' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  block?: boolean
  icon?: IconName
  to?: string
}

export function Button({ variant = 'secondary', size = 'md', block, icon, to, className, children, ...rest }: ButtonProps) {
  const cls = ['btn', `btn--${variant}`, size !== 'md' && `btn--${size}`, block && 'btn--block', className]
    .filter(Boolean)
    .join(' ')
  const content = (
    <>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} stroke={2} />}
      {children}
    </>
  )
  if (to && !rest.disabled) {
    return (
      <Link to={to} className={cls} style={rest.style}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" className={cls} {...rest}>
      {content}
    </button>
  )
}

export function IconButton({
  icon,
  label,
  to,
  onClick,
  className,
  disabled,
}: {
  icon: IconName
  label: string
  to?: string
  onClick?: () => void
  className?: string
  disabled?: boolean
}) {
  if (to) {
    return (
      <Link to={to} className={`icon-btn ${className ?? ''}`} aria-label={label}>
        <Icon name={icon} />
      </Link>
    )
  }
  return (
    <button type="button" className={`icon-btn ${className ?? ''}`} aria-label={label} onClick={onClick} disabled={disabled}>
      <Icon name={icon} />
    </button>
  )
}

export function GoogleButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="btn btn-google btn--block" onClick={onClick} disabled={disabled}>
      <span className="btn-google__g">G</span>
      המשך עם Google
    </button>
  )
}

/* ─────────── Segmented control ─────────── */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size,
  className,
  label,
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'lg'
  className?: string
  label?: string
}) {
  return (
    <div className={`segmented ${size ? `segmented--${size}` : ''} ${className ?? ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className="segmented__opt"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  fill,
}: {
  tabs: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  fill?: boolean
}) {
  return (
    <div className={`tabs ${fill ? 'tabs--fill' : ''}`} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          className="tabs__tab"
          aria-selected={t.value === value}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/* ─────────── Mode (radio) card ─────────── */

export function ModeCard({
  checked,
  title,
  desc,
  onSelect,
}: {
  checked: boolean
  title: string
  desc: ReactNode
  onSelect: () => void
}) {
  return (
    <button type="button" role="radio" aria-checked={checked} className="mode-card" onClick={onSelect}>
      <span className="radio-dot" />
      <span className="stack" style={{ gap: 3 }}>
        <span className="mode-card__title">{title}</span>
        <span className="mode-card__desc">{desc}</span>
      </span>
    </button>
  )
}

/* ─────────── Chips, tags, badges ─────────── */

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={!!active} onClick={onClick}>
      {children}
    </button>
  )
}

export function Tag({ children, small, onRemove }: { children: ReactNode; small?: boolean; onRemove?: () => void }) {
  return (
    <span className={`tag ${small ? 'tag--sm' : ''}`}>
      <bdi>{children}</bdi>
      {onRemove && (
        <button type="button" className="tag__x" onClick={onRemove} aria-label="הסרת תגית">
          ×
        </button>
      )}
    </span>
  )
}

export function TypeBadge({ type }: { type: CardType }) {
  const cls = type === 'cloze' ? 'badge--cloze' : type === 'image' ? 'badge--image' : ''
  return <span className={`badge ${cls}`}>{CARD_TYPE_LABEL[type]}</span>
}

export function LeechBadge() {
  return (
    <span className="badge badge--leech" title="קיבל &quot;שוב&quot; 3 פעמים או יותר — כדאי לשכתב">
      עלוקה
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <b className="kbd">{children}</b>
}

/* ─────────── Progress & mastery ─────────── */

/** Round progress: seen (light) under high-mastery (dark). */
export function SeenHighBar({ total, seen, high, thin }: { total: number; seen: number; high: number; thin?: boolean }) {
  return (
    <div className={`progress ${thin ? 'progress--thin' : ''}`}>
      <div className="progress__fill" style={{ width: pct(seen, total), background: 'var(--m2)' }} />
      <div className="progress__fill" style={{ width: pct(Math.min(high, total), total), background: 'var(--m5)' }} />
    </div>
  )
}

export function ProgressBar({ value, total, extra }: { value: number; total: number; extra?: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemax={total}>
      <div className="progress__fill" style={{ width: pct(value, total), background: 'var(--accent)' }} />
      {!!extra && (
        <div
          className="progress__fill"
          style={{ insetInlineStart: pct(value, total), width: pct(extra, total), background: 'var(--m2)' }}
        />
      )}
    </div>
  )
}

export function MasteryMeter({ level }: { level: number }) {
  const color = `var(--m${Math.max(level, 1)})`
  return (
    <span className="mastery-meter" aria-label={`רמת שליטה ${level}`} title={`רמה ${level}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} style={i <= level ? { background: color } : undefined} />
      ))}
    </span>
  )
}

export function MasteryHistogram({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts)
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="histogram">
        {counts.map((n, l) => (
          <div className="histogram__col" key={l}>
            <span className="histogram__n">{n}</span>
            <div className="histogram__bar" style={{ height: `${(n / max) * 70}px`, background: `var(--m${l})` }} />
          </div>
        ))}
      </div>
      <div className="histogram__axis">
        {counts.map((_, l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  )
}

export function MasteryRows({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts)
  return (
    <div className="mastery-rows">
      {counts.map((n, l) => (
        <div className="mastery-row" key={l}>
          <span className="muted">רמה {l}</span>
          <div className="mastery-row__track">
            <div className="mastery-row__fill" style={{ width: pct(n, max), background: `var(--m${l})` }} />
          </div>
          <span className="num muted" style={{ textAlign: 'left' }}>
            {n}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ─────────── Fields ─────────── */

export function SearchField({
  value,
  onChange,
  placeholder = 'חיפוש בכרטיסים',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="search">
      <Icon name="search" size={18} />
      <input type="search" enterKeyHint="search" autoCorrect="off" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} dir="auto" />
    </label>
  )
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} className="checkbox" onClick={() => onChange(!checked)}>
      <span className="checkbox__box">{checked ? '✓' : ''}</span>
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="field">
      <div className="field__head">
        <span className="field__label">{label}</span>
        {hint && <span className="field__hint">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function TagInput({ tags, onChange, suggestions = [] }: { tags: string[]; onChange: (t: string[]) => void; suggestions?: string[] }) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    const t = draft.trim().replace(/,$/, '')
    if (t && !tags.includes(t)) onChange([...tags, t])
    setDraft('')
  }
  return (
    <div className="tag-input">
      {tags.map((t) => (
        <Tag key={t} onRemove={() => onChange(tags.filter((x) => x !== t))}>
          {t}
        </Tag>
      ))}
      <input
        value={draft}
        dir="auto"
        list="tag-suggestions"
        enterKeyHint="done"
        autoComplete="off"
        autoCapitalize="none"
        placeholder={tags.length ? '' : 'הוסף תגית…'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={commit}
      />
      <datalist id="tag-suggestions">
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  )
}

/* ─────────── Empty & loading ─────────── */

export function EmptyState({ title, text, children }: { title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__art" />
      <div className="empty__title">{title}</div>
      {text && <div className="empty__text">{text}</div>}
      {children && <div className="empty__actions">{children}</div>}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="row" style={{ gap: 10, justifyContent: 'center', fontSize: 13, color: 'var(--ink3)', padding: 8 }}>
      <span className="spinner" />
      {label}
    </div>
  )
}

export function DeckSkeleton() {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="skel" style={{ height: 14, width: '40%' }} />
      {[1, 2, 3].map((k) => (
        <div key={k} className="panel stack" style={{ padding: 18, gap: 12 }}>
          <div className="skel" style={{ height: 16, width: '55%' }} />
          <div className="skel" style={{ height: 12, width: '35%' }} />
          <div className="skel" style={{ height: 6 }} />
        </div>
      ))}
      <Spinner label="טוען חפיסות…" />
    </div>
  )
}

/* ─────────── Brand ─────────── */

export function Logo({ size = 28, text = 17, to }: { size?: number; text?: number; to?: string }) {
  const inner = (
    <>
      <span
        className="logo__mark"
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.24),
          ['--logo-glyph' as string]: `url(${logoGlyph})`,
        }}
      />
      <span className="logo__name" style={{ fontSize: text }}>
        כרטיסיות אורז
      </span>
    </>
  )
  return to ? (
    <Link to={to} className="logo">
      {inner}
    </Link>
  ) : (
    <span className="logo">{inner}</span>
  )
}

export function Avatar({ name, photo, to, size }: { name: string | null; photo?: string | null; to?: string; size?: number }) {
  const style = size ? { width: size, height: size } : undefined
  const content = photo ? <img src={photo} alt="" referrerPolicy="no-referrer" /> : initials(name)
  return to ? (
    <Link to={to} className="avatar" style={style} aria-label="הגדרות">
      {content}
    </Link>
  ) : (
    <span className="avatar" style={style}>
      {content}
    </span>
  )
}

/* ─────────── Overlays ─────────── */

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="sheet__title">{title}</div>
          <IconButton icon="close" label="סגירה" onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  )
}

export function Menu({
  trigger,
  items,
}: {
  trigger: (open: () => void) => ReactNode
  items: { label: string; onClick?: () => void; to?: string; danger?: boolean }[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {trigger(() => setOpen((o) => !o))}
      {open && (
        <div className="menu" role="menu">
          {items.map((it) =>
            it.to ? (
              <Link key={it.label} to={it.to} className={`menu__item ${it.danger ? 'menu__item--danger' : ''}`} role="menuitem">
                {it.label}
              </Link>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={`menu__item ${it.danger ? 'menu__item--danger' : ''}`}
                onClick={() => {
                  setOpen(false)
                  it.onClick?.()
                }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2600)
    return () => clearTimeout(t)
  }, [msg])
  return [msg ? <div className="toast" role="status">{msg}</div> : null, setMsg]
}
