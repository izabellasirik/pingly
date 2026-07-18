export type Priority = "HIGH" | "LOW";

export interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  role: string | null;
  notes: string | null;
  tags: string | null;
  followUpDate: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactWithInteractions extends Contact {
  interactions: Interaction[];
}

export interface Interaction {
  id: string;
  contactId: string;
  note: string;
  date: string;
  createdAt: string;
}

export interface DailyTask {
  id: string;
  title: string;
  priority: Priority;
  done: boolean;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyTask {
  id: string;
  title: string;
  done: boolean;
  weekStart: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedContact {
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  role: string | null;
  followUpDate: string | null;
  notes: string | null;
}
