import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createPersonAction } from "@/app/actions/people";
import { PersonForm } from "@/components/PersonForm";

export const metadata = { title: "Add a person" };

export default function NewPersonPage() {
  return (
    <div className="space-y-5 pt-1">
      <Link href="/people" className="btn-ghost -ml-3 !px-3">
        <ChevronLeft className="size-5" aria-hidden />
        People
      </Link>
      <h1 className="text-[28px] font-bold tracking-tight">Add a person</h1>
      <div className="card p-5">
        <PersonForm action={createPersonAction} submitLabel="Save person" showMemory />
      </div>
      <p className="px-1 text-center text-[13px] text-muted">
        Tip: you can also just tell Pingly — “I met David today. He’s a financial advisor and loves golf.”
      </p>
    </div>
  );
}
