export default function ResetAppDataConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Reset app data?</h1>
      <p role="alert">
        Resetting deletes your trip, expenses, categories, and exchange
        rates. This cannot be undone.
      </p>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onConfirm} className="text-[var(--danger)]">
          Delete all app data
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
