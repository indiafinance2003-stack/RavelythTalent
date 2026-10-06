"use client";

import { useSearchParams } from "next/navigation";

export function AdminActionError() {
  const message = useSearchParams().get("adminError");
  if (!message) return null;
  return (
    <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
      <span className="font-semibold">The form could not be saved.</span>{" "}
      {message}
    </div>
  );
}
