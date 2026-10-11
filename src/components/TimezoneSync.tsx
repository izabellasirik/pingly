"use client";

import { useEffect } from "react";
import { syncTimezoneAction } from "@/app/actions/account";

/** Keeps the account's time zone matched to this device, once per session. */
export function TimezoneSync() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz || sessionStorage.getItem("pingly:tz") === tz) return;
      sessionStorage.setItem("pingly:tz", tz);
      void syncTimezoneAction(tz);
    } catch {
      // Storage can be unavailable (private mode); syncing is best-effort.
    }
  }, []);
  return null;
}
