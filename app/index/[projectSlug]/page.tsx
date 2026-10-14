import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { ensureProjectPublishingColumn } from "@/lib/project-schema";
import { ensureWorkspacePublishingColumn } from "@/lib/workspace-schema";

export const dynamic = "force-dynamic";

type PublicProject = DbRow & {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  updated_at: Date;
};

type PublicTask = DbRow & {
  id: number;
  name: string;
  due_date: Date | null;
  status_name: string;
  status_category: "not_started" | "active" | "closed";
};

type Filter = "all" | PublicTask["status_category"];

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "not_started", label: "Belum Dimulai" },
  { value: "active", label: "Aktif" },
  { value: "closed", label: "Selesai" },
];

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

function categoryLabel(category: PublicTask["status_category"]) {
  if (category === "active") return "Dikerjakan";
  if (category === "closed") return "Selesai";
  return "Antrian";
}

async function getPublicProject(projectSlug: string) {
  await ensureWorkspacePublishingColumn();
  await ensureProjectPublishingColumn();

  const [projects] = await db.query<PublicProject[]>(
    `SELECT projects.id, projects.slug, projects.name, projects.description,
        GREATEST(
          projects.updated_at,
          COALESCE(MAX(tasks.updated_at), projects.updated_at)
        ) AS updated_at
     FROM projects
     INNER JOIN workspaces ON workspaces.id = projects.workspace_id
     LEFT JOIN tasks ON tasks.project_id = projects.id
     WHERE projects.slug = ?
       AND projects.is_private = 0
       AND (
         projects.publish_override = 1
         OR (
           projects.publish_override IS NULL
           AND workspaces.is_published = 1
         )
       )
     GROUP BY projects.id, projects.slug, projects.name, projects.description,
       projects.updated_at
     LIMIT 1`,
    [projectSlug],
  );

  const project = projects[0];
  if (!project) return null;

  const [tasks] = await db.query<PublicTask[]>(
    `SELECT tasks.id, tasks.name, tasks.due_date,
        project_statuses.name AS status_name,
        project_statuses.category AS status_category
     FROM tasks
     INNER JOIN project_statuses ON project_statuses.id = tasks.status_id
     WHERE tasks.project_id = ?
     ORDER BY
       COALESCE(array_position(ARRAY['active', 'not_started', 'closed']::text[], project_statuses.category::text), 0),
       tasks.due_date IS NULL,
       tasks.due_date ASC,
       tasks.created_at DESC`,
    [project.id],
  );

  return { project, tasks };
}

export default async function PublicProjectPage(
  props: PageProps<"/index/[projectSlug]">,
) {
  const { projectSlug } = await props.params;
  const searchParams = await props.searchParams;
  const requestedFilter = searchParams.filter;
  const activeFilter: Filter = FILTERS.some(
    ({ value }) => value === requestedFilter,
  )
    ? (requestedFilter as Filter)
    : "all";
  const data = await getPublicProject(projectSlug);

  if (!data) notFound();

  const { project, tasks } = data;
  const counts = {
    not_started: tasks.filter(
      (task) => task.status_category === "not_started",
    ).length,
    active: tasks.filter((task) => task.status_category === "active").length,
    closed: tasks.filter((task) => task.status_category === "closed").length,
  };
  const total = tasks.length;
  const progress = total ? Math.round((counts.closed / total) * 100) : 0;
  const notStartedEnd = total ? (counts.not_started / total) * 100 : 0;
  const activeEnd = total
    ? ((counts.not_started + counts.active) / total) * 100
    : 0;
  const visibleTasks =
    activeFilter === "all"
      ? tasks
      : tasks.filter((task) => task.status_category === activeFilter);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-7 text-zinc-950 dark:bg-[#090909] dark:text-zinc-100 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/index"
          className="inline-flex items-center gap-2 text-xs font-medium text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
          Kembali ke monitoring
        </Link>

        <header className="mt-5">
          <h1 className="text-2xl font-semibold sm:text-3xl">{project.name}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            {project.description || "Belum ada deskripsi project."}
          </p>
          <p className="mt-4 font-mono text-xs text-zinc-500 dark:text-zinc-500">
            Terakhir diperbarui: {formatDate(project.updated_at)} &nbsp;|&nbsp; {total} task
          </p>
        </header>

        <section className="mt-8 border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#121214] sm:p-6">
          <div className="grid gap-6 md:grid-cols-[210px_1fr] md:items-center">
            <div className="flex justify-center">
              <div
                className="relative flex size-36 items-center justify-center rounded-full"
                style={{
                  background:
                    total === 0
                      ? "#3f3f46"
                      : `conic-gradient(#71717a 0 ${notStartedEnd}%, #fbbf24 ${notStartedEnd}% ${activeEnd}%, #34d399 ${activeEnd}% 100%)`,
                }}
              >
                <div className="flex size-24 flex-col items-center justify-center rounded-full bg-white dark:bg-[#121214]">
                  <strong className="text-2xl">{progress}%</strong>
                  <span className="mt-0.5 text-[10px] uppercase text-zinc-500">
                    selesai
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="grid grid-cols-3 divide-x divide-black/10 border border-black/10 dark:divide-white/10 dark:border-white/10">
                {[
                  ["Belum Dimulai", counts.not_started, "bg-zinc-500"],
                  ["Aktif", counts.active, "bg-amber-400"],
                  ["Selesai", counts.closed, "bg-emerald-400"],
                ].map(([label, count, color]) => (
                  <div key={label} className="min-w-0 px-3 py-4 sm:px-4">
                    <p className="flex items-center gap-2 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      <span className={`size-2 shrink-0 ${color}`} />
                      {label}
                    </p>
                    <p className="mt-2 text-xl font-semibold">{count}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>Progres keseluruhan</span>
                  <span>
                    {progress}% ({counts.closed}/{total})
                  </span>
                </div>
                <div className="h-2 overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full bg-emerald-400"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <nav className="flex overflow-x-auto border-b border-black/10 dark:border-white/10">
            {FILTERS.map((filter) => {
              const selected = filter.value === activeFilter;

              return (
                <Link
                  key={filter.value}
                  href={
                    filter.value === "all"
                      ? `/index/${project.slug}`
                      : `/index/${project.slug}?filter=${filter.value}`
                  }
                  className={`shrink-0 border-b-2 px-4 py-3 text-sm transition ${
                    selected
                      ? "border-zinc-950 font-semibold text-zinc-950 dark:border-white dark:text-white"
                      : "border-transparent text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                >
                  {filter.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-x border-black/10 dark:border-white/10">
            {visibleTasks.length ? (
              visibleTasks.map((task) => (
                <div
                  key={task.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-black/10 px-4 py-3 text-sm dark:border-white/10 sm:grid-cols-[1fr_120px_130px]"
                >
                  <span className="truncate font-medium">{task.name}</span>
                  <span className="hidden font-mono text-xs text-zinc-500 sm:block dark:text-zinc-400">
                    {task.due_date ? formatDate(task.due_date) : "Tanpa tanggal"}
                  </span>
                  <span className="hidden truncate text-xs text-zinc-500 sm:block dark:text-zinc-400">
                    {categoryLabel(task.status_category)}
                  </span>
                </div>
              ))
            ) : (
              <p className="border-b border-black/10 px-4 py-10 text-center text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                Tidak ada task pada kategori ini.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
