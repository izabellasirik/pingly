import { describe, expect, it } from "vitest";
import {
  addOneYearLocal,
  birthdayForReminder,
  birthdayReminderAt,
  calendarDaysBetween,
  endOfLocalDay,
  formatTime,
  nextBirthdayDate,
  parseDateOnly,
  relativeDayLabel,
  utcToZonedParts,
  zonedToUtc,
} from "@/lib/dates";

describe("zonedToUtc", () => {
  it("converts local wall time to UTC across time zones", () => {
    expect(zonedToUtc("2026-10-12", "18:00", "America/New_York")!.toISOString()).toBe(
      "2026-10-12T22:00:00.000Z",
    );
    expect(zonedToUtc("2026-01-12", "18:00", "America/New_York")!.toISOString()).toBe(
      "2026-01-12T23:00:00.000Z",
    );
    expect(zonedToUtc("2026-10-12", "09:00", "Asia/Tokyo")!.toISOString()).toBe(
      "2026-10-12T00:00:00.000Z",
    );
  });

  it("moves times in a DST gap forward instead of failing", () => {
    // 2026-03-08 02:30 does not exist in New York.
    const d = zonedToUtc("2026-03-08", "02:30", "America/New_York")!;
    expect(utcToZonedParts(d, "America/New_York").time).toBe("03:30");
  });

  it("rejects impossible dates and times", () => {
    expect(zonedToUtc("2026-02-30", "09:00", "UTC")).toBeNull();
    expect(zonedToUtc("2026-02-10", "24:00", "UTC")).toBeNull();
    expect(parseDateOnly("2026-13-01")).toBeNull();
  });

  it("round-trips through utcToZonedParts", () => {
    const d = zonedToUtc("2026-11-01", "01:30", "Europe/Berlin")!;
    expect(utcToZonedParts(d, "Europe/Berlin")).toEqual({ date: "2026-11-01", time: "01:30" });
  });
});

describe("birthdays", () => {
  const tz = "America/Los_Angeles";
  const now = zonedToUtc("2026-10-11", "12:00", tz)!;

  it("finds the next occurrence, rolling into next year when passed", () => {
    expect(nextBirthdayDate(12, 25, now, tz)).toBe("2026-12-25");
    expect(nextBirthdayDate(2, 15, now, tz)).toBe("2027-02-15");
    expect(nextBirthdayDate(10, 11, now, tz)).toBe("2026-10-11"); // today counts
  });

  it("handles Feb 29 in common years", () => {
    expect(nextBirthdayDate(2, 29, now, tz)).toBe("2027-02-28");
    const leapNow = zonedToUtc("2027-10-01", "12:00", tz)!;
    expect(nextBirthdayDate(2, 29, leapNow, tz)).toBe("2028-02-29");
  });

  it("reminds the morning before the birthday", () => {
    const at = birthdayReminderAt(2, 15, now, tz);
    expect(utcToZonedParts(at, tz)).toEqual({ date: "2027-02-14", time: "09:00" });
    expect(birthdayForReminder(at, tz)).toBe("2027-02-15");
  });

  it("reminder for a birthday on Jan 1 fires on Dec 31 of the previous year", () => {
    const at = birthdayReminderAt(1, 1, now, tz);
    expect(utcToZonedParts(at, tz)).toEqual({ date: "2026-12-31", time: "09:00" });
  });
});

describe("addOneYearLocal", () => {
  it("keeps the local wall-clock time across DST", () => {
    const tz = "Europe/London";
    const d = zonedToUtc("2026-07-01", "09:00", tz)!;
    expect(utcToZonedParts(addOneYearLocal(d, tz), tz)).toEqual({ date: "2027-07-01", time: "09:00" });
  });
});

describe("day math", () => {
  const tz = "Asia/Kolkata";
  it("counts calendar days in the user's zone, not UTC", () => {
    const a = new Date("2026-10-11T18:00:00Z"); // 23:30 local, Oct 11
    const b = new Date("2026-10-11T19:00:00Z"); // 00:30 local, Oct 12
    expect(calendarDaysBetween(a, b, tz)).toBe(1);
  });

  it("computes the end of the local day", () => {
    const now = new Date("2026-10-11T10:00:00Z");
    expect(endOfLocalDay(now, tz).toISOString()).toBe("2026-10-11T18:30:00.000Z");
  });

  it("labels days relative to today", () => {
    const now = zonedToUtc("2026-10-11", "10:00", "UTC")!; // a Sunday
    expect(relativeDayLabel("2026-10-11", now, "UTC")).toBe("Today");
    expect(relativeDayLabel("2026-10-12", now, "UTC")).toBe("Tomorrow");
    expect(relativeDayLabel("2026-10-10", now, "UTC")).toBe("Yesterday");
    expect(relativeDayLabel("2026-10-08", now, "UTC")).toBe("3 days ago");
    expect(relativeDayLabel("2026-10-15", now, "UTC")).toBe("Thursday");
    expect(relativeDayLabel("2026-10-30", now, "UTC")).toBe("Oct 30");
    expect(relativeDayLabel("2027-01-03", now, "UTC")).toBe("Jan 3, 2027");
  });

  it("formats 24h time as 12h", () => {
    expect(formatTime("18:00")).toBe("6:00 PM");
    expect(formatTime("00:05")).toBe("12:05 AM");
    expect(formatTime("12:30")).toBe("12:30 PM");
  });
});
