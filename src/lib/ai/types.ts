// Types shared by the server and the Ask screen.

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type BirthdayValue = { month: number; day: number; year: number | null };

export type PersonField = "relationship" | "birthday" | "email" | "phone";

export type FieldChange = {
  field: PersonField;
  /** Value currently saved (null when empty). Sent back on confirm to detect conflicts. */
  from: string | BirthdayValue | null;
  to: string | BirthdayValue;
  fromLabel: string | null;
  toLabel: string;
};

export type Proposal =
  | {
      kind: "create_person";
      key: string;
      name: string;
      relationship: string | null;
      birthday: BirthdayValue | null;
      email: string | null;
      phone: string | null;
      memories: string[];
      /** Saved people with the same first name, so the user can pick one instead. */
      similar: { id: string; name: string; relationship: string | null }[];
    }
  | { kind: "add_memories"; key: string; personId: string; personName: string; memories: string[] }
  | { kind: "update_person"; key: string; personId: string; personName: string; changes: FieldChange[] }
  | {
      kind: "create_reminder";
      key: string;
      personId: string | null;
      /** Key of a create_person proposal in the same reply, when the person is new. */
      personKey: string | null;
      personName: string | null;
      title: string;
      note: string | null;
      reminderKind: "birthday" | "follow_up" | "check_in" | "custom";
      date: string;
      time: string;
      recurrence: "none" | "yearly";
    };

export type AskResult =
  | {
      ok: true;
      reply: string;
      proposals: Proposal[];
      draft: { personName: string | null; text: string } | null;
      choices: string[];
      /** People this answer was about; sent back with the next message for follow-ups. */
      contextPersonIds: string[];
    }
  | { ok: false; error: string; notConfigured?: boolean };
