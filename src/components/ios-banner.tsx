import * as React from "react";
import { usePrefs } from "@/lib/prefs-context";

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document);
}

export function IOSBanner() {
  const { lang } = usePrefs();
  const [show, setShow] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    setShow(detectIOS());
    try {
      if (sessionStorage.getItem("sv_ios_banner_dismissed") === "1") setDismissed(true);
    } catch {}
  }, []);

  if (!show || dismissed) return null;

  const msg = lang === "my"
    ? "⚠️ iOS တွင် အသံ feature များ အပြည့်အဝ မပံ့ပိုးသေးပါ။ Android သို့မဟုတ် Desktop ကို အသုံးပြုပါ။"
    : "⚠️ iOS support is currently limited. Voice features are not fully supported yet. Please use Android or desktop for the best experience.";

  return (
    <div
      role="alert"
      className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-100 backdrop-blur"
    >
      <span className="flex-1">{msg}</span>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          try { sessionStorage.setItem("sv_ios_banner_dismissed", "1"); } catch {}
        }}
        aria-label={lang === "my" ? "ပိတ်ရန်" : "Dismiss"}
        className="rounded-md px-2 py-1 text-amber-100 hover:bg-amber-500/20"
      >
        ✕
      </button>
    </div>
  );
}
