"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ask } from "@/lib/ai/ask";
import { applyProposal, type ApplyResult } from "@/lib/ai/apply";
import type { AskResult } from "@/lib/ai/types";

const AskInput = z.object({
  message: z.string().max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(8000) }))
    .max(40),
  contextPersonIds: z.array(z.string()).max(20),
});

export async function askAction(input: unknown): Promise<AskResult> {
  const user = await requireUser();
  const parsed = AskInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Something went wrong. Please try again." };
  try {
    return await ask(user, parsed.data);
  } catch (error) {
    console.error("[pingly] ask failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Saves one suggestion after the user tapped Save. Nothing is saved without this. */
export async function applyProposalAction(proposal: unknown): Promise<ApplyResult> {
  const user = await requireUser();
  return applyProposal(user, proposal);
}
