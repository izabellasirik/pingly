import { Suspense } from "react";
import { connection } from "next/server";
import { isAIConfigured } from "@/lib/env";
import { Chat } from "@/components/Chat";
import { ListSkeleton } from "@/components/Skeletons";

export const metadata = { title: "Ask AI" };

export default function AskPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={2} />}>
      <AskLoader />
    </Suspense>
  );
}

async function AskLoader() {
  // Read the AI configuration at request time, not at build time.
  await connection();
  return <Chat aiConfigured={isAIConfigured()} />;
}
