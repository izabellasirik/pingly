import { z } from "zod";

// What the model returns. Every field is required (nullable when unused) so
// structured outputs can guarantee the shape.

const Birthday = z.object({
  month: z.number().int(),
  day: z.number().int(),
  year: z.number().int().nullable(),
});

const CreatePerson = z.object({
  type: z.literal("create_person"),
  name: z.string(),
  relationship: z.string().nullable(),
  birthday: Birthday.nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  memories: z.array(z.string()),
});

const AddMemories = z.object({
  type: z.literal("add_memories"),
  person_id: z.string(),
  memories: z.array(z.string()),
});

const UpdatePerson = z.object({
  type: z.literal("update_person"),
  person_id: z.string(),
  relationship: z.string().nullable(),
  birthday: Birthday.nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

const CreateReminder = z.object({
  type: z.literal("create_reminder"),
  person_id: z.string().nullable(),
  new_person_name: z.string().nullable(),
  title: z.string(),
  note: z.string().nullable(),
  kind: z.enum(["birthday", "follow_up", "check_in", "custom"]),
  date: z.string(),
  time: z.string(),
  recurrence: z.enum(["none", "yearly"]),
});

export const ModelAction = z.discriminatedUnion("type", [
  CreatePerson,
  AddMemories,
  UpdatePerson,
  CreateReminder,
]);

export const ModelOutput = z.object({
  reply: z.string(),
  actions: z.array(ModelAction),
  draft: z.object({ person_id: z.string().nullable(), text: z.string() }).nullable(),
  choices: z.array(z.string()),
});

export type ModelOutput = z.infer<typeof ModelOutput>;
export type ModelAction = z.infer<typeof ModelAction>;
