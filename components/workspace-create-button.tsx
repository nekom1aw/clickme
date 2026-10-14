"use client";

import { PlusIcon } from "@heroicons/react/24/outline";

export default function WorkspaceCreateButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("clickme-create-workspace"))}
      className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/85"
    >
      <PlusIcon className="size-4" />
      Buat workspace
    </button>
  );
}
