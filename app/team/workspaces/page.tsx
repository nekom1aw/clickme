import { redirect } from "next/navigation";
import Link from "next/link";
import type { DbRow } from "@/lib/db";
import { Squares2X2Icon } from "@heroicons/react/24/outline";
import db from "@/lib/db";
import WorkspaceCreateButton from "@/components/workspace-create-button";
import { getSessionUserId } from "@/lib/session";

type WorkspaceRow = DbRow & {
  id: number;
  name: string;
  description: string | null;
  slug: string;
  project_count: number;
  task_count: number;
  is_owner: number;
  role: string | null;
};

export default async function WorkspacesPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const [workspaces] = await db.query<WorkspaceRow[]>(
    `SELECT w.id,w.name,w.description,w.slug,(w.owner_id=?)::int is_owner,wm.role,
        COUNT(DISTINCT CASE WHEN pm.user_id=? THEN p.id END) project_count,
        COUNT(DISTINCT CASE WHEN pm.user_id=? THEN t.id END) task_count
     FROM workspaces w
     LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=?
     LEFT JOIN projects p ON p.workspace_id=w.id
     LEFT JOIN project_members pm ON pm.project_id=p.id
     LEFT JOIN tasks t ON t.project_id=p.id
     WHERE w.owner_id=? OR wm.user_id=? OR pm.user_id=?
     GROUP BY w.id,w.name,w.description,w.slug,w.owner_id,wm.role
     ORDER BY w.created_at ASC,w.id ASC`,
    [userId, userId, userId, userId, userId, userId, userId],
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 lg:px-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-white/75">
            <Squares2X2Icon className="size-5" />
            <span className="text-xs uppercase tracking-widest">Workspace tools</span>
          </div>
          <h1 className="text-3xl font-semibold">Workspaces</h1>
          <p className="mt-2 text-sm text-white/45">Lihat dan kelola seluruh workspace dalam satu tempat.</p>
        </div>
        <WorkspaceCreateButton />
      </header>

      {workspaces.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {workspaces.map((workspace) => (
            <Link key={workspace.id} href={`/team/workspaces/${workspace.slug}`} className="group rounded-xl border border-white/10 bg-white/[0.025] p-5 transition hover:border-white/20 hover:bg-white/[0.05]">
              <div className="flex items-start justify-between gap-4">
                <span className="flex size-10 items-center justify-center rounded-xl bg-violet-500/15 text-lg font-semibold text-violet-200">{workspace.name.slice(0, 1).toLowerCase()}</span>
                <span className="rounded-md bg-white/[0.06] px-2 py-1 text-xs text-white/50">{workspace.is_owner ? "Owner" : workspace.role}</span>
              </div>
              <h2 className="mt-5 font-semibold text-white/85 transition group-hover:text-white">{workspace.name}</h2>
              <p className="mt-2 min-h-10 line-clamp-2 text-sm leading-5 text-white/40">{workspace.description || "Tanpa deskripsi"}</p>
              <div className="mt-5 flex items-center justify-between border-t border-white/[0.08] pt-4 text-xs text-white/40">
                <span>{Number(workspace.project_count)} project</span>
                <span>{Number(workspace.task_count)} task</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/15 px-6 py-14 text-center text-sm text-white/45">Belum ada workspace.</div>
      )}
    </main>
  );
}
