"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/copy/fr";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleLogout}
      className="inline-flex min-h-[48px] cursor-pointer items-center text-body text-ink underline underline-offset-4 disabled:opacity-60"
    >
      {pending ? copy.auth.logoutPending : copy.auth.logoutAction}
    </button>
  );
}
