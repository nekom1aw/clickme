import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  FlagIcon,
  FolderIcon,
} from "@heroicons/react/24/outline";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { getSessionUserId } from "@/lib/session";

type UserRow = DbRow & {
  id: number;
  name: string;
};

type AssignedTaskRow = DbRow & {
  id: number;
  name: string;
  due_date: Date | string | null;
  priority: "urgent" | "high" | "normal" | "low" | null;
  status_name: string;
  status_category: "not_started" | "active" | "closed";
  project_id: number;
  project_name: string;
  project_slug: string;
  view_slug: string;
  workspace_name: string;
};

type ProjectGroup = {
  id: number;
  name: string;
  workspaceName: string;
  href: string;
  tasks: AssignedTaskRow[];
};

const categoryStyles = {
  not_started: "bg-white/10 text-white/65",
  active: "bg-blue-500/15 text-blue-400",
  closed: "bg-emerald-500/15 text-emerald-400",
} satisfies Record<AssignedTaskRow["status_category"], string>;

const priorityStyles = {
  urgent: "text-red-400",
  high: "text-amber-400",
  normal: "text-blue-400",
  low: "text-white/45",
} satisfies Record<NonNullable<AssignedTaskRow["priority"]>, string>;

async function getCurrentUser() {
  const userId = await getSessionUserId();

  if (!userId) {
    redirect("/login");
  }

  const [rows] = await db.query<UserRow[]>(
    "SELECT id, name FROM users WHERE id = ? LIMIT 1",
    [userId],
  );
  const user = rows[0];

  if (!user) {
    redirect("/login");
  }

  return user;
}

async function getAssignedTasks(userId: number) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS task_assignees (
      task_id integer NOT NULL,
      user_id integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (task_id, user_id)
    )
  `);

  const [rows] = await db.query<AssignedTaskRow[]>(
    `SELECT
        tasks.id,
        tasks.name,
        tasks.due_date,
        tasks.priority,
        project_statuses.name AS status_name,
        project_statuses.category AS status_category,
        projects.id AS project_id,
        projects.name AS project_name,
        projects.slug AS project_slug,
        projects.view_slug,
        workspaces.name AS workspace_name
     FROM tasks
     INNER JOIN projects ON projects.id = tasks.project_id
     INNER JOIN workspaces ON workspaces.id = projects.workspace_id
     INNER JOIN project_statuses ON project_statuses.id = tasks.status_id
     WHERE tasks.assignee_id = ?
        OR EXISTS (
          SELECT 1
          FROM task_assignees
          WHERE task_assignees.task_id = tasks.id
            AND task_assignees.user_id = ?
        )
     ORDER BY
       workspaces.name ASC,
       projects.name ASC,
       CASE WHEN project_statuses.category = 'closed' THEN 1 ELSE 0 END ASC,
       tasks.due_date IS NULL ASC,
       tasks.due_date ASC,
       tasks.id DESC`,
    [userId, userId],
  );

  return rows;
}

function groupTasksByProject(tasks: AssignedTaskRow[]) {
  const groups = new Map<number, ProjectGroup>();

  for (const task of tasks) {
    const currentGroup = groups.get(task.project_id);

    if (currentGroup) {
      currentGroup.tasks.push(task);
      continue;
    }

    groups.set(task.project_id, {
      id: task.project_id,
      name: task.project_name,
      workspaceName: task.workspace_name,
      href: `/team/projects/${task.project_slug}/v/l/${task.view_slug}`,
      tasks: [task],
    });
  }

  return Array.from(groups.values());
}

function formatDueDate(value: Date | string | null) {
  if (!value) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function isOverdue(task: AssignedTaskRow) {
  if (!task.due_date || task.status_category === "closed") {
    return false;
  }

  const dueDate = new Date(task.due_date);
  dueDate.setHours(23, 59, 59, 999);
  return dueDate.getTime() < Date.now();
}

export default async function TeamPage() {
  const user = await getCurrentUser();
  const tasks = await getAssignedTasks(user.id);
  const projectGroups = groupTasksByProject(tasks);
  const openTaskCount = tasks.filter(
    (task) => task.status_category !== "closed",
  ).length;
  const completedTaskCount = tasks.length - openTaskCount;
  const overdueTaskCount = tasks.filter(isOverdue).length;

  return (
    <div className="assigned-page min-h-screen">
      <main id="assigned" className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <header className="assigned-header">
          <div className="assigned-header-icon"><ClipboardDocumentListIcon className="size-6" /></div>
          <div>
            <p className="assigned-eyebrow">PERSONAL WORKLOAD</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">My Assigned</h1>
            <p className="assigned-muted mt-2 text-sm leading-6 sm:text-[15px]">Tasks assigned to {user.name}, grouped by project.</p>
          </div>
        </header>

        <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Assignment summary">
          <div className="assigned-stat"><span className="assigned-stat-label">ACTIVE TASKS</span><strong>{openTaskCount}</strong></div>
          <div className="assigned-stat"><span className="assigned-stat-label">PROJECTS</span><strong>{projectGroups.length}</strong></div>
          <div className="assigned-stat assigned-stat-warning"><span className="assigned-stat-label">OVERDUE</span><strong>{overdueTaskCount}</strong></div>
          <div className="assigned-stat assigned-stat-success"><span className="assigned-stat-label">COMPLETED</span><strong>{completedTaskCount}</strong></div>
        </section>

        {projectGroups.length > 0 ? (
          <div className="mt-6 space-y-4">
            {projectGroups.map((project) => (
              <section key={project.id} className="assigned-project overflow-hidden">
                <div className="assigned-project-header flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="assigned-project-icon"><FolderIcon className="size-4.5" /></div>
                    <div className="min-w-0">
                      <p className="assigned-eyebrow truncate">{project.workspaceName}</p>
                      <h2 className="mt-0.5 truncate text-[15px] font-semibold">{project.name}</h2>
                    </div>
                    <span className="assigned-task-count hidden sm:inline-flex">{project.tasks.length} {project.tasks.length === 1 ? "task" : "tasks"}</span>
                  </div>
                  <Link
                    href={project.href}
                    className="assigned-open-project flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition"
                  >
                    Open project
                    <ArrowTopRightOnSquareIcon className="size-3.5" />
                  </Link>
                </div>

                <div className="assigned-task-list">
                  {project.tasks.map((task) => (
                    <Link
                      key={task.id}
                      href={project.href}
                      className="assigned-task-row grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(220px,1fr)_150px_135px_110px] sm:px-5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        {task.status_category === "closed" ? (
                          <CheckCircleIcon className="size-4 shrink-0 text-emerald-400" />
                        ) : (
                          <span className={`size-3.5 shrink-0 rounded-full border-2 ${
                              task.status_category === "active"
                                ? "border-blue-500"
                                : "assigned-neutral-border border-dashed"
                            }`} />
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{task.name}</span>
                          <span className="assigned-muted mt-1 flex items-center gap-3 text-[11px] sm:hidden">
                            <span className={isOverdue(task) ? "text-red-400" : ""}>{formatDueDate(task.due_date)}</span>
                            <span className="capitalize">{task.priority ?? "No priority"}</span>
                          </span>
                        </span>
                      </div>

                      <span
                        className={`assigned-status justify-self-end rounded-md px-2 py-1 text-[11px] font-semibold sm:justify-self-start ${categoryStyles[task.status_category]}`}
                      >
                        {task.status_name}
                      </span>

                      <span
                        className={`hidden items-center gap-1.5 text-xs sm:flex ${
                            isOverdue(task) ? "text-red-400" : "assigned-muted"
                        }`}
                      >
                        <CalendarDaysIcon className="size-3.5 shrink-0" />
                        {formatDueDate(task.due_date)}
                      </span>

                      <span
                        className={`hidden items-center gap-1.5 text-xs capitalize sm:flex ${
                          task.priority
                            ? priorityStyles[task.priority]
                            : "assigned-muted"
                        }`}
                      >
                        <FlagIcon className="size-3.5 shrink-0" />
                        {task.priority ?? "No priority"}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="assigned-empty mt-6 flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <div className="assigned-empty-icon"><ClipboardDocumentListIcon className="size-6" /></div>
            <h2 className="mt-4 text-sm font-semibold">No assigned tasks</h2>
            <p className="assigned-muted mt-1 max-w-sm text-xs leading-5">
              Tasks assigned to you will appear here and be grouped automatically by project.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
