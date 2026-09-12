"use client";

/**
 * A labelled `type="date"` control.
 *
 * The native date input is deliberate: on a phone, tapping it opens the
 * platform calendar picker, which is the calendar selection this app wants
 * without pulling in a date library (REFERENCE.md §2 rules those out).
 *
 * The picker only opens on the indicator glyph on some desktop browsers, so
 * every field also carries a hint telling the traveller they can type or pick.
 */
export default function DateField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  onUseToday,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  onUseToday?: () => void;
}) {
  const messageId = `${id}-message`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1"
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
        />
        {onUseToday && (
          <button
            type="button"
            onClick={onUseToday}
            className="btn-secondary shrink-0 px-3"
          >
            Today
          </button>
        )}
      </div>
      {error ? (
        <p id={messageId} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-(--muted)">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
