import { addDays, addWeeks, nextDay, startOfDay, type Day } from "date-fns";

export interface ParsedContact {
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  role: string | null;
  followUpDate: Date | null;
  notes: string | null;
}

const WEEKDAYS: Record<string, Day> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

/** Converts spoken digit words ("five five five") into a run of digits, leaving other text untouched. */
function spokenDigitsToNumbers(text: string): string {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 3) out.push(run.join(""));
    else out.push(...run);
    run = [];
  };
  for (const w of words) {
    const clean = w.toLowerCase().replace(/[.,]/g, "");
    if (clean in NUMBER_WORDS) {
      run.push(String(NUMBER_WORDS[clean]));
    } else {
      flush();
      out.push(w);
    }
  }
  flush();
  return out.join(" ");
}

/** Turns spoken-style emails ("john at gmail dot com") into "john@gmail.com". */
function normalizeSpokenEmail(text: string): string {
  return text.replace(
    /([a-zA-Z0-9._%+-]+)\s+at\s+([a-zA-Z0-9.-]+)\s+dot\s+(com|org|net|io|co|edu|gov)\b/gi,
    (_m, user, domain, tld) => `${user}@${domain}.${tld}`,
  );
}

function extractEmail(text: string): { value: string | null; remainder: string } {
  const normalized = normalizeSpokenEmail(text);
  const match = normalized.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (!match) return { value: null, remainder: text };
  const value = match[0];
  const remainder = normalized.replace(value, " ");
  return { value, remainder };
}

function extractPhone(text: string): { value: string | null; remainder: string } {
  const withDigits = spokenDigitsToNumbers(text);
  const match = withDigits.match(/(\+?\d[\d\s().-]{7,}\d)/);
  if (!match) return { value: null, remainder: text };
  let value = match[0].replace(/\s+/g, " ").trim();
  // Digit-by-digit speech ("5 5 5 1 2 3 4 5 6 7") collapses into one run; grouped
  // formats ("555 123 4567") are left alone since they're already readable.
  const tokens = value.split(" ");
  if (tokens.length >= 5 && tokens.every((t) => /^\d{1,2}$/.test(t))) {
    value = tokens.join("");
  }
  const remainder = withDigits.replace(match[0], " ");
  return { value, remainder };
}

function captureAfter(text: string, patterns: RegExp[]): { value: string | null; remainder: string } {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const value = match[1].trim().replace(/[.,;]+$/, "");
      const remainder = text.replace(match[0], " ");
      return { value, remainder };
    }
  }
  return { value: null, remainder: text };
}

// Stop the greedy capture groups below at the next known keyword/clause boundary.
// Lookahead (not a consuming group) so the boundary word itself stays in the
// remainder for the next extractor to see.
const STOP_WORDS =
  "(?=,| and | but | who | he | she | they | works | work | from | at | is a| is an| as a| as an| phone| email| e-mail| number| call| text| follow|$)";

function extractName(text: string): { value: string | null; remainder: string } {
  const patterns = [
    new RegExp(`\\badd(?: a)?(?: new)? contact(?: for| named| called)?\\s+([a-z][a-z' -]*?)${STOP_WORDS}`, "i"),
    new RegExp(`\\bnew contact(?: for| named| called)?\\s+([a-z][a-z' -]*?)${STOP_WORDS}`, "i"),
    new RegExp(`\\b(?:his|her|their) name is\\s+([a-z][a-z' -]*?)${STOP_WORDS}`, "i"),
    new RegExp(`\\bthis is\\s+([a-z][a-z' -]*?)${STOP_WORDS}`, "i"),
    new RegExp(`\\bmet\\s+([a-z][a-z' -]*?)${STOP_WORDS}`, "i"),
    new RegExp(`\\bcontact\\s+([a-z][a-z' -]*?)${STOP_WORDS}`, "i"),
  ];
  const result = captureAfter(text, patterns);
  if (result.value) {
    return { value: toTitleCase(result.value), remainder: result.remainder };
  }
  return { value: null, remainder: text };
}

// Generic places/events, not companies - filters out false positives from the loose "at X" fallback.
const GENERIC_PLACES = new Set([
  "the conference",
  "the meeting",
  "the event",
  "the office",
  "the gym",
  "the store",
  "the party",
  "the bar",
  "the restaurant",
  "work",
  "school",
  "the airport",
  "the show",
]);

function extractCompany(text: string): { value: string | null; remainder: string } {
  const patterns = [
    /\bworks?\s+at\s+([a-z0-9][a-z0-9' &.-]*?)(?=,| as | in | who| phone| email| follow|$)/i,
    /\bfrom\s+([a-z0-9][a-z0-9' &.-]*?)(?=,| as | who| phone| email| follow|$)/i,
    /(?<!\bmet\s)\bat\s+([a-z0-9][a-z0-9' &.-]*?)(?=,| as | who| phone| email| follow|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || !match[1]) continue;
    const value = match[1].trim().replace(/[.,;]+$/, "");
    if (GENERIC_PLACES.has(value.toLowerCase())) continue;
    return { value: toTitleCase(value), remainder: text.replace(match[0], " ") };
  }
  return { value: null, remainder: text };
}

function extractRole(text: string): { value: string | null; remainder: string } {
  const patterns = [
    /\bas an?\s+([a-z][a-z0-9' -]*?)(?=,| at | who| phone| email| follow|$)/i,
    /\bis the\s+([a-z][a-z0-9' -]*?)(?=,| at | who| phone| email| follow|$)/i,
  ];
  const result = captureAfter(text, patterns);
  if (result.value) return { value: toTitleCase(result.value), remainder: result.remainder };
  return { value: null, remainder: text };
}

function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function parseRelativeDate(phrase: string, now: Date): Date | null {
  const text = phrase.trim().toLowerCase();
  const today = startOfDay(now);

  if (/^today$/.test(text)) return today;
  if (/^tomorrow$/.test(text)) return addDays(today, 1);

  const inMatch = text.match(/^in\s+(\d+|a|an)\s+(day|days|week|weeks)$/);
  if (inMatch) {
    const n = inMatch[1] === "a" || inMatch[1] === "an" ? 1 : parseInt(inMatch[1], 10);
    return inMatch[2].startsWith("week") ? addWeeks(today, n) : addDays(today, n);
  }

  if (/^next week$/.test(text)) return addWeeks(today, 1);

  const nextDayMatch = text.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (nextDayMatch) {
    const target = WEEKDAYS[nextDayMatch[1]];
    return nextDay(today, target);
  }

  const plainDayMatch = text.match(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (plainDayMatch) {
    const target = WEEKDAYS[plainDayMatch[1]];
    return nextDay(today, target);
  }

  const monthDayMatch = text.match(
    /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?$/,
  );
  if (monthDayMatch) {
    const month = MONTHS[monthDayMatch[1]];
    const day = parseInt(monthDayMatch[2], 10);
    const year = now.getFullYear();
    let candidate = new Date(year, month, day);
    if (candidate < today) candidate = new Date(year + 1, month, day);
    return candidate;
  }

  const dayMonthMatch = text.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december)$/,
  );
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1], 10);
    const month = MONTHS[dayMonthMatch[2]];
    const year = now.getFullYear();
    let candidate = new Date(year, month, day);
    if (candidate < today) candidate = new Date(year + 1, month, day);
    return candidate;
  }

  return null;
}

function extractFollowUp(text: string, now: Date): { value: Date | null; remainder: string } {
  const patterns = [
    /\bfollow[\s-]?up\s+(?:on\s+|in\s+|next\s+)?([a-z0-9 ]+?)(?:,|\.|$)/i,
    /\bremind me\s+(?:on\s+|in\s+|next\s+)?([a-z0-9 ]+?)(?:,|\.|$)/i,
    /\bcall(?:\s+him| her| them)? back\s+(?:on\s+|in\s+|next\s+)?([a-z0-9 ]+?)(?:,|\.|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const rawPhrase = match[1].trim();
    // Re-add the "next"/"in" keyword the outer regex consumed, since parseRelativeDate needs it.
    const fullMatch = match[0];
    const keywordMatch = fullMatch.match(/\b(on|in|next)\s/i);
    const phrase = keywordMatch ? `${keywordMatch[1].toLowerCase()} ${rawPhrase}` : rawPhrase;
    const date = parseRelativeDate(phrase, now) ?? parseRelativeDate(rawPhrase, now);
    if (date) {
      return { value: date, remainder: text.replace(fullMatch, " ") };
    }
  }
  return { value: null, remainder: text };
}

/**
 * Best-effort extraction of structured contact fields from a free-form voice transcript.
 * Anything not confidently matched is preserved in `notes` so nothing spoken is lost.
 */
export function parseContactFromText(rawText: string, now: Date = new Date()): ParsedContact {
  const original = rawText.trim();
  let working = original;

  const email = extractEmail(working);
  working = email.remainder;

  const phone = extractPhone(working);
  working = phone.remainder;

  const followUp = extractFollowUp(working, now);
  working = followUp.remainder;

  const name = extractName(working);
  working = name.remainder;

  const company = extractCompany(working);
  working = company.remainder;

  const role = extractRole(working);
  working = role.remainder;

  const notes = original;

  return {
    name: name.value,
    phone: phone.value,
    email: email.value,
    company: company.value,
    role: role.value,
    followUpDate: followUp.value,
    notes,
  };
}
