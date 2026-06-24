import * as React from "react";
import { usePrefs } from "@/lib/prefs-context";

export function ContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = usePrefs();
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="contact-title" className="text-2xl font-bold">{t("contactUs")}</h2>
        <p className="mt-3 text-base">{t("contactBody")}</p>
        <div className="mt-4 space-y-2 text-base">
          <p>
            <a
              href="mailto:hello@sunlitvoice.app"
              className="font-semibold text-primary underline underline-offset-4"
            >
              hello@sunlitvoice.app
            </a>
          </p>
          <p className="text-muted-foreground">
            We reply within 1–2 business days.
          </p>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-primary px-5 py-2.5 text-base font-semibold text-primary-foreground"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
