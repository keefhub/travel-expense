export default function ConfirmParticipantAction({
  actionLabel,
  participantName,
  onConfirm,
  onCancel,
}: {
  actionLabel: "Remove" | "Leave";
  participantName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const message =
    actionLabel === "Remove"
      ? `Remove ${participantName} from the trip?`
      : "Leave this trip?";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-(--background) p-4">
        <p>{message}</p>
        <div className="flex flex-col gap-2">
          <button type="button" className="btn-danger" onClick={onConfirm}>
            {actionLabel}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
