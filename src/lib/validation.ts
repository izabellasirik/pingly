import { z } from "zod";
import { isValidMonthDay, parseDateOnly, parseTime } from "@/lib/dates";

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const birthdaySchema = z
  .object({
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    year: z.number().int().min(1900).max(2100).nullish(),
  })
  .refine((b) => isValidMonthDay(b.month, b.day), { message: "That date doesn't exist." })
  .refine((b) => b.year == null || b.month !== 2 || b.day !== 29 || isLeap(b.year), {
    message: "That year has no February 29.",
  });

function isLeap(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export const personFieldsSchema = z.object({
  name: trimmed(120).min(1, "Add a name."),
  relationship: optionalText(60),
  birthday: birthdaySchema.nullish().transform((v) => v ?? null),
  email: z
    .string()
    .trim()
    .max(254)
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "That email looks off."),
  phone: optionalText(40),
});
export type PersonFields = z.infer<typeof personFieldsSchema>;

export const memorySchema = trimmed(500).min(1, "Write something to remember.");

export const dateString = z.string().refine((v) => parseDateOnly(v) !== null, "Pick a valid date.");
export const timeString = z.string().refine((v) => parseTime(v) !== null, "Pick a valid time.");

export const reminderKindSchema = z.enum(["birthday", "follow_up", "check_in", "custom"]);
export const recurrenceSchema = z.enum(["none", "yearly"]);

export const reminderInputSchema = z.object({
  personId: z.uuid().nullish().transform((v) => v ?? null),
  title: trimmed(160).min(1, "Add a title."),
  note: optionalText(500),
  kind: reminderKindSchema.default("custom"),
  date: dateString,
  time: timeString,
  recurrence: recurrenceSchema.default("none"),
});
export type ReminderInput = z.infer<typeof reminderInputSchema>;

/** Parses "YYYY-MM-DD" or "MM-DD" from a form into a birthday. */
export function birthdayFromForm(value: FormDataEntryValue | null): PersonFields["birthday"] | "invalid" {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const full = parseDateOnly(raw);
  if (full) return { month: full.month, day: full.day, year: full.year };
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (m && isValidMonthDay(Number(m[1]), Number(m[2]))) {
    return { month: Number(m[1]), day: Number(m[2]), year: null };
  }
  return "invalid";
}

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the form.";
}
