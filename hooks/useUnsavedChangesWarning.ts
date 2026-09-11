import { useEffect, useRef } from "react";

export default function useUnsavedChangesWarning(isDirty: boolean): void {
  const isDiscardingRef = useRef(false);

  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (isDiscardingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
}
