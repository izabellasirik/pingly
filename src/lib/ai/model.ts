import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { aiModel } from "@/lib/env";
import { SYSTEM_PROMPT } from "./prompt";
import { ModelOutput } from "./schema";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  // Reads ANTHROPIC_API_KEY (and optional ANTHROPIC_BASE_URL) from the server environment.
  client ??= new Anthropic({ timeout: 60_000, maxRetries: 2 });
  return client;
}

// Models that accept the server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

export class ModelError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
  }
}

/**
 * One structured-output call. The model returns a reply plus suggested
 * actions; it never touches the database.
 */
export async function callModel(
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<ModelOutput> {
  const model = aiModel();
  let response;
  try {
    response = await getClient().beta.messages.parse({
      model,
      max_tokens: 8000,
      ...(FALLBACK_MODELS.has(model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      output_config: { effort: "low", format: betaZodOutputFormat(ModelOutput) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages,
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ModelError(error.message, "The AI service rejected the server's API key.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ModelError(error.message, "Pingly is a little busy right now. Try again in a moment.");
    }
    if (error instanceof Anthropic.APIError) {
      throw new ModelError(`${error.status} ${error.message}`, "The AI service had a problem. Please try again.");
    }
    throw new ModelError(String(error), "Couldn't reach the AI service. Check your connection and try again.");
  }

  if (response.stop_reason === "refusal") {
    throw new ModelError("refusal", "I can't help with that one.");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new ModelError(`unparsed output (${response.stop_reason})`, "I got confused there. Could you rephrase?");
  }
  return response.parsed_output;
}
