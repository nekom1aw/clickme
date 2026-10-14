"use client";

import { PlusIcon } from "@heroicons/react/24/outline";

export default function WorkspaceCreateProjectButton({ workspaceId }: { workspaceId: number }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("clickme-create-project", { detail: workspaceId }))}
      className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/85"
    >
      <PlusIcon className="size-4" />
      Buat project
    </button>
  );
}
