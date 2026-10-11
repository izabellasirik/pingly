"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, Copy, RotateCcw, Sparkles } from "lucide-react";
import { applyProposalAction, askAction } from "@/app/actions/ask";
import type { ChatTurn, Proposal } from "@/lib/ai/types";
import { ProposalCard, type CardState } from "@/components/ProposalCard";

type Message =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      cards: CardState[];
      draft: { personName: string | null; text: string } | null;
      choices: string[];
      error?: boolean;
    };

type Saved = { messages: Message[]; contextPersonIds: string[] };

const STORAGE_KEY = "pingly:chat";
const EXAMPLES = [
  "I met Emily today. She’s a designer and loves hiking.",
  "Remind me to call Mom tomorrow at 6 PM",
  "What should I get Anna for her birthday?",
  "What do I remember about Michael?",
];

let seq = 0;
const uid = () => `${Date.now().toString(36)}-${++seq}`;

function load(): Saved {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    // ignore unreadable storage
  }
  return { messages: [], contextPersonIds: [] };
}

const noop = () => () => {};

/** The conversation lives in this tab's sessionStorage, so render it on the client only. */
export function Chat({ aiConfigured }: { aiConfigured: boolean }) {
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  if (!isClient) return <div className="skeleton h-40" aria-hidden />;
  return <ChatView aiConfigured={aiConfigured} />;
}

function ChatView({ aiConfigured }: { aiConfigured: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [initial] = useState(load);
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [contextPersonIds, setContext] = useState<string[]>(initial.contextPersonIds);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const handledQuery = useRef<string | null>(null);
  const state = useRef<Saved>(initial);
  useEffect(() => {
    state.current = { messages, contextPersonIds };
  }, [messages, contextPersonIds]);
  // People created from a card, by "messageId:cardKey" — read synchronously by "Save all".
  const createdPeople = useRef(new Map<string, string>());

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.slice(-40), contextPersonIds }));
    } catch {
      // storage full or unavailable — the chat still works in memory
    }
  }, [messages, contextPersonIds]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || thinking) return;
      const history: ChatTurn[] = state.current.messages
        .filter((m) => !(m.role === "assistant" && m.error))
        .map((m) => ({ role: m.role, text: m.text }));
      setMessages((ms) => [...ms, { id: uid(), role: "user", text: message }]);
      setInput("");
      setThinking(true);
      try {
        const res = await askAction({ message, history, contextPersonIds: state.current.contextPersonIds });
        if (res.ok) {
          setContext(res.contextPersonIds);
          setMessages((ms) => [
            ...ms,
            {
              id: uid(),
              role: "assistant",
              text: res.reply,
              cards: res.proposals.map((proposal) => ({ proposal, status: "idle" as const })),
              draft: res.draft,
              choices: res.choices,
            },
          ]);
        } else {
          setMessages((ms) => [...ms, { id: uid(), role: "assistant", text: res.error, cards: [], draft: null, choices: [], error: true }]);
        }
      } catch {
        setMessages((ms) => [
          ...ms,
          { id: uid(), role: "assistant", text: "Couldn’t reach Pingly. Check your connection and try again.", cards: [], draft: null, choices: [], error: true },
        ]);
      } finally {
        setThinking(false);
      }
    },
    [thinking],
  );

  // A question handed over from Today, People or the capture box (?q=…).
  useEffect(() => {
    const q = params.get("q");
    if (!q || !aiConfigured || handledQuery.current === q) return;
    handledQuery.current = q;
    router.replace("/ask", { scroll: false });
    void send(q);
  }, [params, aiConfigured, router, send]);

  const updateCard = (messageId: string, key: string, patch: Partial<CardState>) =>
    setMessages((ms) =>
      ms.map((m) =>
        m.id === messageId && m.role === "assistant"
          ? { ...m, cards: m.cards.map((c) => (c.proposal.key === key ? { ...c, ...patch } : c)) }
          : m,
      ),
    );

  /** Saves one card. Returns whether it succeeded. */
  const save = async (messageId: string, key: string): Promise<boolean> => {
    const msg = state.current.messages.find((m) => m.id === messageId);
    if (!msg || msg.role !== "assistant") return false;
    const card = msg.cards.find((c) => c.proposal.key === key);
    if (!card || card.status === "saved" || card.status === "dismissed") return card?.status === "saved";

    let proposal = card.proposal;
    if (proposal.kind === "create_reminder" && proposal.personKey) {
      const personCard = msg.cards.find((c) => c.proposal.key === (proposal as { personKey: string }).personKey);
      const personId =
        createdPeople.current.get(`${messageId}:${proposal.personKey}`) ?? personCard?.savedPersonId ?? null;
      if (!personId) {
        updateCard(messageId, key, { status: "error", error: "Save the person first." });
        return false;
      }
      proposal = { ...proposal, personId };
    }

    updateCard(messageId, key, { status: "saving", error: undefined });
    try {
      const res = await applyProposalAction(proposal);
      if (res.ok) {
        updateCard(messageId, key, { status: "saved", savedPersonId: res.data.personId });
        if (proposal.kind === "create_person" && res.data.personId) {
          createdPeople.current.set(`${messageId}:${key}`, res.data.personId);
        }
        if (res.data.personId) setContext((ids) => [...new Set([res.data.personId!, ...ids])].slice(0, 8));
        return true;
      }
      updateCard(messageId, key, { status: "error", error: res.error });
    } catch {
      updateCard(messageId, key, { status: "error", error: "Couldn’t save. Check your connection and try again." });
    }
    return false;
  };

  const saveAll = async (messageId: string) => {
    const msg = state.current.messages.find((m) => m.id === messageId);
    if (!msg || msg.role !== "assistant") return;
    // Cards are ordered people → details → reminders, so dependencies save first.
    for (const c of msg.cards) {
      if (c.status !== "idle" && c.status !== "error") continue;
      // Re-read: earlier saves in this loop update the state ref after each render.
      await save(messageId, c.proposal.key);
    }
  };

  const reset = () => {
    setMessages([]);
    setContext([]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-col">
      {!aiConfigured && (
        <div className="card mb-4 border border-accent/30 p-4 text-[15px]" role="status">
          <p className="font-semibold">AI isn’t set up on this server yet</p>
          <p className="mt-1 text-muted">
            An administrator needs to add an <code>ANTHROPIC_API_KEY</code>. Everything else works — you can{" "}
            <Link href="/people/new" className="text-accent underline">
              add people
            </Link>{" "}
            and reminders by hand.
          </p>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Sparkles className="size-7" aria-hidden />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Ask Pingly</h1>
          <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted">
            Tell it about someone, ask what you know, or set a reminder. Nothing is saved until you confirm.
          </p>
          <div className="mt-6 flex w-full max-w-md flex-col gap-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                type="button"
                className="card px-4 py-3 text-left text-[15px] transition hover:bg-surface-2 disabled:opacity-50"
                onClick={() => send(e)}
                disabled={!aiConfigured}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-4 pb-4" aria-live="polite">
          <div className="flex justify-end">
            <button type="button" className="btn-ghost btn-sm" onClick={reset}>
              <RotateCcw className="size-3.5" aria-hidden />
              New chat
            </button>
          </div>
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p className="animate-in max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-ink px-4 py-2.5 text-[16px] text-bg">
                  {m.text}
                </p>
              </div>
            ) : (
              <div key={m.id} className="animate-in max-w-[92%] space-y-3" data-testid="assistant-message">
                <p className={`whitespace-pre-wrap rounded-3xl rounded-bl-lg px-4 py-2.5 text-[16px] leading-relaxed ${m.error ? "bg-accent-soft text-ink" : "bg-surface shadow-card"}`}>
                  {m.text}
                </p>
                {m.draft && <DraftCard draft={m.draft} />}
                {m.cards.length > 0 && (
                  <div className="space-y-2">
                    {m.cards.map((c) => {
                      const p = c.proposal;
                      const blocker =
                        p.kind === "create_reminder" && p.personKey
                          ? m.cards.find((x) => x.proposal.key === p.personKey)
                          : undefined;
                      return (
                        <ProposalCard
                          key={p.key}
                          card={c}
                          blockedBy={blocker && blocker.status !== "saved" ? (blocker.proposal as { name: string }).name : null}
                          onSave={() => save(m.id, p.key)}
                          onDismiss={() => updateCard(m.id, p.key, { status: "dismissed" })}
                          onChange={(proposal: Proposal) => updateCard(m.id, p.key, { proposal, error: undefined })}
                          onUseExisting={(person) => {
                            if (p.kind !== "create_person") return;
                            updateCard(m.id, p.key, {
                              proposal: { kind: "add_memories", key: p.key, personId: person.id, personName: person.name, memories: p.memories },
                              status: p.memories.length ? "idle" : "dismissed",
                            });
                          }}
                        />
                      );
                    })}
                    {m.cards.filter((c) => c.status === "idle" || c.status === "error").length > 1 && (
                      <button type="button" className="btn-accent btn-sm" onClick={() => saveAll(m.id)}>
                        Save all
                      </button>
                    )}
                  </div>
                )}
                {m.choices.length > 0 && m.id === messages[messages.length - 1]?.id && (
                  <div className="flex flex-wrap gap-2">
                    {m.choices.map((c) => (
                      <button key={c} type="button" className="btn-soft btn-sm" onClick={() => send(c)} disabled={thinking}>
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
          {thinking && (
            <div className="flex items-center gap-1.5 px-2 py-3" aria-label="Pingly is thinking" role="status">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      <form
        className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-2 md:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="card flex items-end gap-2 p-2 pl-4 ring-1 ring-line focus-within:ring-2 focus-within:ring-accent/40">
          <label htmlFor="ask-input" className="sr-only">
            Message Pingly
          </label>
          <textarea
            id="ask-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder={aiConfigured ? "Ask or tell Pingly anything…" : "AI isn’t configured"}
            disabled={!aiConfigured}
            maxLength={2000}
            className="max-h-40 min-w-0 flex-1 resize-none bg-transparent py-2 text-[16px] outline-none placeholder:text-muted [field-sizing:content]"
          />
          <button type="submit" className="btn-accent !size-10 shrink-0 !p-0" aria-label="Send" disabled={!aiConfigured || thinking || !input.trim()}>
            <ArrowUp className="size-5" aria-hidden />
          </button>
        </div>
      </form>
    </div>
  );
}

function DraftCard({ draft }: { draft: { personName: string | null; text: string } }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-line bg-surface p-4" data-testid="draft">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
        Draft{draft.personName ? ` for ${draft.personName}` : ""}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{draft.text}</p>
      <button
        type="button"
        className="btn-soft btn-sm mt-3"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(draft.text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard can be blocked; the text is still selectable.
          }
        }}
      >
        <Copy className="size-4" aria-hidden />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
