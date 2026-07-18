"use client";

import { useRouter } from "next/navigation";
import ContactForm, { type ContactFormValues } from "@/components/ContactForm";

export default function NewContactPage() {
  const router = useRouter();

  async function handleSubmit(values: ContactFormValues) {
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        followUpDate: values.followUpDate ? new Date(values.followUpDate).toISOString() : null,
      }),
    });
    if (!res.ok) throw new Error("Failed to create contact");
    const contact = await res.json();
    router.push(`/contacts/${contact.id}`);
    router.refresh();
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Add contact</h1>
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <ContactForm submitLabel="Create contact" onSubmit={handleSubmit} onCancel={() => router.back()} />
      </div>
    </div>
  );
}
