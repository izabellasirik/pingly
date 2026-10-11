import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">Reset your password</h1>
      <AuthForm
        action={requestPasswordReset}
        submitLabel="Send reset link"
        fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
      />
      <p className="mt-5 text-center text-[14px]">
        <Link href="/login" className="text-muted hover:text-ink">
          Back to log in
        </Link>
      </p>
    </>
  );
}
