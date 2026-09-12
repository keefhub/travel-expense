/**
 * A single loading placeholder bar shaped like the content it stands in for.
 *
 * Deliberately static (no pulse/shimmer): design.md §7 bans looping animation, and a loop here
 * would be the one place in the app that violates its own motion rule for the sake of "looking
 * loaded." Compose a handful of these, sized to match the real layout, instead of a spinner.
 */
export default function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-md bg-(--border) ${className}`}
    />
  );
}
