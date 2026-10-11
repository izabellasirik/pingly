import { updatePassword } from "@/app/actions/auth";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "New password" };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="mb-5 text-xl font-semibold">Choose a new password</h1>
      <AuthForm
        action={updatePassword}
        submitLabel="Save password"
        fields={[{ name: "password", label: "New password (8+ characters)", type: "password", autoComplete: "new-password", minLength: 8 }]}
      />
    </>
  );
}
