import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { DbRow } from "@/lib/db";
import { FolderIcon, LockClosedIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import db from "@/lib/db";
import WorkspaceCreateProjectButton from "@/components/workspace-create-project-button";
import { getSessionUserId } from "@/lib/session";

type WorkspaceRow = DbRow & {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  role: string | null;
};

type ProjectRow = DbRow & {
  id: number;
  name: string;
  description: string | null;
  slug: string;
  view_slug: string;
  is_private: number;
  permission: string;
  task_count: number;
};

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const { workspaceSlug } = await params;
  const [workspaces] = await db.query<WorkspaceRow[]>(
    `SELECT DISTINCT w.id,w.name,w.description,w.owner_id,wm.role
     FROM workspaces w
     LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=?
     LEFT JOIN projects p ON p.workspace_id=w.id
     LEFT JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=?
     WHERE w.slug=? AND (w.owner_id=? OR wm.user_id=? OR pm.user_id=?) LIMIT 1`,
    [userId, userId, workspaceSlug, userId, userId, userId],
  );
  const workspace = workspaces[0];
  if (!workspace) notFound();

  const [projects] = await db.query<ProjectRow[]>(
    `SELECT p.id,p.name,p.description,p.slug,p.view_slug,p.is_private,pm.permission,COUNT(t.id) task_count
     FROM projects p
     INNER JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=?
     LEFT JOIN tasks t ON t.project_id=p.id
     WHERE p.workspace_id=?
     GROUP BY p.id,p.name,p.description,p.slug,p.view_slug,p.is_private,pm.permission
     ORDER BY p.created_at DESC,p.id DESC`,
    [userId, workspace.id],
  );
  const canCreate = Number(workspace.owner_id) === userId || ["administrator", "manager"].includes(workspace.role ?? "");

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 lg:px-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-white/75">
            <Squares2X2Icon className="size-5" />
            <span className="text-xs uppercase tracking-widest">Workspace</span>
          </div>
          <h1 className="text-3xl font-semibold">{workspace.name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/45">{workspace.description || "Kelola seluruh project dalam workspace ini."}</p>
        </div>
        {canCreate ? <WorkspaceCreateProjectButton workspaceId={workspace.id} /> : null}
      </header>

      {projects.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <Link key={project.id} href={`/team/projects/${project.slug}/v/l/${project.view_slug}`} className="group rounded-xl border border-white/10 bg-white/[0.025] p-5 transition hover:border-white/20 hover:bg-white/[0.05]">
              <div className="flex items-start justify-between gap-4">
                <FolderIcon className="size-6 text-white/75" />
                <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-1 text-xs text-white/50">
                  {project.is_private ? <LockClosedIcon className="size-3" /> : null}
                  {project.is_private ? "Private" : "Workspace"}
                </span>
              </div>
              <h2 className="mt-5 font-semibold text-white/85 transition group-hover:text-white">{project.name}</h2>
              <p className="mt-2 min-h-10 line-clamp-2 text-sm leading-5 text-white/40">{project.description || "Tanpa deskripsi"}</p>
              <div className="mt-5 flex items-center justify-between border-t border-white/[0.08] pt-4 text-xs text-white/40">
                <span>{project.permission}</span>
                <span>{Number(project.task_count)} task</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/15 px-6 py-14 text-center">
          <FolderIcon className="mx-auto size-8 text-white/25" />
          <p className="mt-3 text-sm text-white/45">Belum ada project di workspace ini.</p>
        </div>
      )}
    </main>
  );
}
