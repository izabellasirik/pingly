"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ParsedContact } from "@/lib/types";

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function VoiceCapture() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<ParsedContact | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  function resetAndClose() {
    recognitionRef.current?.stop();
    setOpen(false);
    setListening(false);
    setTranscript("");
    setParsed(null);
    setError(null);
  }

  function startListening() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    setError(null);
    setParsed(null);
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let combined = "";
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0].transcript;
      }
      setTranscript(combined);
    };
    recognition.onerror = () => {
      setError("Couldn't access the microphone. You can type the transcript below instead.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  async function handleParse() {
    if (!transcript.trim()) return;
    setParsing(true);
    setError(null);
    try {
      const res = await fetch("/api/voice/parse-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcript }),
      });
      if (!res.ok) throw new Error("Parsing failed");
      const data: ParsedContact = await res.json();
      setParsed(data);
    } catch {
      setError("Something went wrong parsing that. Try again or fill the form manually.");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!parsed || !parsed.name?.trim()) {
      setError("A name is required before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) throw new Error("Save failed");
      const contact = await res.json();
      resetAndClose();
      router.push(`/contacts/${contact.id}`);
      router.refresh();
    } catch {
      setError("Couldn't save the contact. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3 text-white font-medium shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-colors"
      >
        <MicIcon />
        Voice capture
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900">Add a contact by voice</h2>
              <button onClick={resetAndClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              {!supported && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Your browser doesn&apos;t support live speech capture. Type or paste what you said below instead.
                </p>
              )}

              <div className="flex items-center gap-3">
                {supported && (
                  <button
                    onClick={listening ? stopListening : startListening}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      listening
                        ? "bg-red-600 text-white hover:bg-red-500"
                        : "bg-indigo-600 text-white hover:bg-indigo-500"
                    }`}
                  >
                    <MicIcon />
                    {listening ? "Stop" : "Start speaking"}
                  </button>
                )}
                {listening && <span className="text-sm text-slate-500 animate-pulse">Listening…</span>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Transcript
                </label>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={3}
                  placeholder='Try: "Add contact Jane Doe, works at Acme as a designer, phone 555 123 4567, follow up next Friday"'
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                onClick={handleParse}
                disabled={!transcript.trim() || parsing}
                className="w-full rounded-md bg-slate-900 text-white text-sm font-medium py-2 disabled:opacity-40 hover:bg-slate-800"
              >
                {parsing ? "Extracting…" : "Extract contact details"}
              </button>

              {error && <p className="text-sm text-red-600">{error}</p>}

              {parsed && (
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <p className="text-xs uppercase tracking-wide text-slate-400 font-medium">
                    Review before saving
                  </p>
                  <Field
                    label="Name"
                    value={parsed.name ?? ""}
                    onChange={(v) => setParsed({ ...parsed, name: v })}
                    required
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Company"
                      value={parsed.company ?? ""}
                      onChange={(v) => setParsed({ ...parsed, company: v })}
                    />
                    <Field
                      label="Role"
                      value={parsed.role ?? ""}
                      onChange={(v) => setParsed({ ...parsed, role: v })}
                    />
                    <Field
                      label="Phone"
                      value={parsed.phone ?? ""}
                      onChange={(v) => setParsed({ ...parsed, phone: v })}
                    />
                    <Field
                      label="Email"
                      value={parsed.email ?? ""}
                      onChange={(v) => setParsed({ ...parsed, email: v })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Follow-up date</label>
                    <input
                      type="date"
                      value={toDateInputValue(parsed.followUpDate)}
                      onChange={(e) =>
                        setParsed({
                          ...parsed,
                          followUpDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                        })
                      }
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                    <textarea
                      value={parsed.notes ?? ""}
                      onChange={(e) => setParsed({ ...parsed, notes: e.target.value })}
                      rows={2}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <button
                    onClick={handleSave}
                    disabled={saving || !parsed.name?.trim()}
                    className="w-full rounded-md bg-indigo-600 text-white text-sm font-medium py-2 disabled:opacity-40 hover:bg-indigo-500"
                  >
                    {saving ? "Saving…" : "Save contact"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );
}

function MicIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" />
      <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.08A7 7 0 0 0 19 11Z" />
    </svg>
  );
}
