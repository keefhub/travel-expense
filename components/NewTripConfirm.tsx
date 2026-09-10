export default function NewTripConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Start a new trip?</h1>
      <p role="alert">
        Starting a new trip deletes your current trip, its expenses, and its exchange rates.
        This cannot be undone.
      </p>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onConfirm} className="text-[var(--danger)]">
          Delete and start new trip
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
