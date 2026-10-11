import Link from "next/link";

export default function PersonNotFound() {
  return (
    <div className="card mt-6 px-6 py-10 text-center">
      <h1 className="text-xl font-semibold">Person not found</h1>
      <p className="mt-2 text-[15px] text-muted">They may have been deleted.</p>
      <Link href="/people" className="btn-soft mt-5">
        Back to People
      </Link>
    </div>
  );
}
