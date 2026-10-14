import Link from "next/link";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { ensureProjectPublishingColumn } from "@/lib/project-schema";
import { ensureWorkspacePublishingColumn } from "@/lib/workspace-schema";

export const dynamic = "force-dynamic";

type MonitoringProject = DbRow & {
  project_id: number;
  project_slug: string;
  project_name: string;
  project_description: string | null;
  total_tasks: number;
  not_started_tasks: number;
  active_tasks: number;
  closed_tasks: number;
  updated_at: Date;
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

async function getMonitoringProjects() {
  await ensureWorkspacePublishingColumn();
  await ensureProjectPublishingColumn();

  const [rows] = await db.query<MonitoringProject[]>(
    `SELECT projects.id AS project_id,
        projects.slug AS project_slug,
        projects.name AS project_name,
        projects.description AS project_description,
        COUNT(tasks.id) AS total_tasks,
        SUM(CASE WHEN project_statuses.category = 'not_started' THEN 1 ELSE 0 END) AS not_started_tasks,
        SUM(CASE WHEN project_statuses.category = 'active' THEN 1 ELSE 0 END) AS active_tasks,
        SUM(CASE WHEN project_statuses.category = 'closed' THEN 1 ELSE 0 END) AS closed_tasks,
        GREATEST(
          projects.updated_at,
          COALESCE(MAX(tasks.updated_at), projects.updated_at)
        ) AS updated_at
     FROM projects
     INNER JOIN workspaces ON workspaces.id = projects.workspace_id
     LEFT JOIN tasks ON tasks.project_id = projects.id
     LEFT JOIN project_statuses ON project_statuses.id = tasks.status_id
     WHERE projects.is_private = 0
       AND (
         projects.publish_override = 1
         OR (
           projects.publish_override IS NULL
           AND workspaces.is_published = 1
         )
       )
     GROUP BY projects.id, projects.slug, projects.name, projects.description, projects.updated_at
     ORDER BY updated_at DESC, projects.id DESC`,
  );

  return rows;
}

export default async function MonitoringPage() {
  const projects = await getMonitoringProjects();

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-[#090909] dark:text-zinc-100">
      <div className="mx-auto max-w-[840px] px-3 py-5 sm:px-4 sm:py-6">
        <div className="mb-3">
          <h1 className="text-sm font-semibold">Monitoring project</h1>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Progres project yang dipublikasikan.
          </p>
        </div>

        {projects.length ? (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
            {projects.map((project) => {
              const total = Number(project.total_tasks);
              const notStarted = Number(project.not_started_tasks);
              const active = Number(project.active_tasks);
              const closed = Number(project.closed_tasks);
              const progress = total
                ? Math.round((closed / total) * 100)
                : 0;
              const segmentWidth = (count: number) =>
                total ? `${(count / total) * 100}%` : "0%";

              return (
                <Link
                  key={project.project_id}
                  href={`/index/${project.project_slug}`}
                  className="flex min-h-40 flex-col border border-black/10 bg-white p-4 transition hover:border-black/25 hover:bg-zinc-50 dark:border-white/10 dark:bg-[#121214] dark:hover:border-white/25 dark:hover:bg-[#171719]"
                >
                  <div className="flex items-start justify-between gap-5">
                    <h2 className="min-w-0 text-base font-semibold">
                      {project.project_name}
                    </h2>
                    <span className="shrink-0 text-lg font-semibold text-emerald-500">
                      {progress}%
                    </span>
                  </div>

                  <p className="mt-2.5 line-clamp-2 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
                    {project.project_description || "Belum ada deskripsi project."}
                  </p>

                  <div className="mt-auto pt-3">
                    <div
                      className="flex h-1.5 w-full overflow-hidden bg-zinc-200 dark:bg-zinc-800"
                      aria-label={`Progres ${project.project_name}: ${progress}% selesai`}
                    >
                      <span
                        className="h-full bg-zinc-500"
                        style={{ width: segmentWidth(notStarted) }}
                      />
                      <span
                        className="h-full bg-amber-400"
                        style={{ width: segmentWidth(active) }}
                      />
                      <span
                        className="h-full bg-emerald-400"
                        style={{ width: segmentWidth(closed) }}
                      />
                    </div>

                    <div className="mt-2.5 flex flex-col gap-2 text-[11px] text-zinc-500 sm:flex-row sm:items-center sm:justify-between dark:text-zinc-400">
                      <div className="flex items-center gap-5">
                        <span className="flex items-center gap-2">
                          <span className="size-2 bg-zinc-500" />
                          {notStarted}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="size-2 bg-amber-400" />
                          {active}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="size-2 bg-emerald-400" />
                          {closed}
                        </span>
                      </div>
                      <span className="font-mono">
                        Diperbarui {formatDate(project.updated_at)}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="border border-black/10 bg-white px-6 py-14 text-center dark:border-white/10 dark:bg-[#121214]">
            <p className="text-sm font-medium">
              Belum ada project yang dipublikasikan.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
