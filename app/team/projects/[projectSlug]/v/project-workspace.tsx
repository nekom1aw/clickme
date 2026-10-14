"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Pin } from "lucide-react";
import {
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  FunnelIcon,
  FlagIcon,
  GlobeAltIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PaperClipIcon,
  PlusIcon,
  Squares2X2Icon,
  TagIcon,
  UserCircleIcon,
  UsersIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import TiptapDescription from "@/components/tiptap-description";

type ViewMode = "list" | "board" | "timeline";
type StatusCategory = "not_started" | "active" | "closed";

type Task = {
  id: number;
  name: string;
  description: string;
  startDate?: string;
  assigneeId?: number | null;
  assigneeIds?: number[];
  assignee: string;
  due: string;
  dueDate?: string;
  priority: string;
  tags?: string[];
  attachments?: TaskAttachment[];
  status: string;
  tone: string;
};

type TaskAttachment = {
  id: number;
  name: string;
  url: string;
  type: string;
  size: number;
  createdAt: string;
  author: string;
};

type StatusGroup = {
  id: number;
  label: string;
  tone: string;
  category: StatusCategory;
  isDefault: boolean;
  tasks: Task[];
};

type ProjectMember = {
  id: number;
  name: string;
  email: string;
};

type WorkspaceTag = {
  id: number;
  name: string;
  color: string;
};

type TaskActivity = {
  id: number;
  type: string;
  message: string;
  actor: string;
  createdAt: string;
  isGuest?: boolean;
  attachment?: Pick<TaskAttachment, "id" | "name" | "url" | "type"> | null;
};

type TaskPublicLink = {
  url: string;
  kind: "data_request" | "shared";
};

type TaskActivitiesResponse = {
  activities?: TaskActivity[];
  canComment?: boolean;
  canPublish?: boolean;
  publicLink?: TaskPublicLink | null;
};

type ProjectWorkspaceProps = {
  projectId: number;
  workspaceId: number;
  workspaceName: string;
  projectName: string;
  projectSlug: string;
  viewSlug: string;
  viewMode: ViewMode;
  groups: StatusGroup[];
  permission: "Full akses" | "Manage" | "Collaborator";
  initialIsPinned: boolean;
};

const STATUS_COLORS = [
  { value: "teal", label: "Teal" },
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "orange", label: "Orange" },
  { value: "purple", label: "Purple" },
  { value: "neutral", label: "Neutral" },
];

const STATUS_CATEGORY_LABELS = {
  not_started: "Not started",
  active: "Active",
  closed: "Closed",
};

const STATUS_CATEGORIES: StatusCategory[] = [
  "not_started",
  "active",
  "closed",
];

function sortStatusGroups(groups: StatusGroup[]) {
  return [...groups].sort((firstGroup, secondGroup) => {
    const firstCategoryIndex = STATUS_CATEGORIES.indexOf(firstGroup.category);
    const secondCategoryIndex = STATUS_CATEGORIES.indexOf(secondGroup.category);

    if (firstCategoryIndex !== secondCategoryIndex) {
      return firstCategoryIndex - secondCategoryIndex;
    }

    return firstGroup.id - secondGroup.id;
  });
}

function truncateTaskName(name: string) {
  return name.length > 35 ? `${name.slice(0, 35)}...` : name;
}

function formatActivityTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const today = new Date();
  const elapsedMilliseconds = today.getTime() - date.getTime();

  if (elapsedMilliseconds >= 0 && elapsedMilliseconds < 60_000) {
    return "Just now";
  }

  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const time = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  if (sameDay) {
    return `Today at ${time}`;
  }

  return `${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date)} at ${time}`;
}

function activityDotClass(type: string) {
  if (type === "status") return "bg-blue-500";
  if (type === "created") return "bg-white/45";
  if (type === "comment") return "bg-purple-500";
  if (type === "priority") return "bg-orange-400";
  if (type === "date") return "bg-red-400";
  return "bg-white/35";
}

function ActivityDot({
  activity,
}: {
  activity: TaskActivity;
}) {
  return (
    <span
      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${activityDotClass(activity.type)}`}
    />
  );
}

export default function ProjectWorkspace({
  projectId,
  workspaceId,
  workspaceName,
  projectName,
  projectSlug,
  viewSlug,
  viewMode,
  groups,
  permission,
  initialIsPinned,
}: ProjectWorkspaceProps) {
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [workspaceGroups, setWorkspaceGroups] = useState(groups);
  const [toolbarMembers, setToolbarMembers] = useState<ProjectMember[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilters, setStatusFilters] = useState<number[]>([]);
  const [priorityFilters, setPriorityFilters] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<number | "unassigned" | null>(null);
  const [isPinned, setIsPinned] = useState(initialIsPinned);
  const [pinBusy, setPinBusy] = useState(false);
  const canManageProject = permission === "Full akses" || permission === "Manage";

  async function togglePin() {
    if (pinBusy) return;
    const nextPinned = !isPinned;
    setIsPinned(nextPinned);
    setPinBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: nextPinned }),
      });
      if (!response.ok) throw new Error("Pin gagal disimpan.");
      window.dispatchEvent(new Event("clickme-projects-updated"));
    } catch {
      setIsPinned(!nextPinned);
    } finally {
      setPinBusy(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/projects/${projectId}/members`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { members?: ProjectMember[] } | null) => {
        if (!controller.signal.aborted) setToolbarMembers(data?.members ?? []);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [projectId]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredGroups = workspaceGroups.map((group) => ({
    ...group,
    tasks: group.tasks.filter((task) => {
      const assigneeIds = getTaskAssigneeIds(task);
      const matchesSearch = !normalizedSearch || [task.name, task.description, ...(task.tags ?? [])]
        .some((value) => value.toLowerCase().includes(normalizedSearch));
      const matchesStatus = !statusFilters.length || statusFilters.includes(group.id);
      const matchesPriority = !priorityFilters.length || priorityFilters.includes(task.priority.toLowerCase());
      const matchesAssignee = assigneeFilter === null ||
        (assigneeFilter === "unassigned" ? assigneeIds.length === 0 : assigneeIds.includes(assigneeFilter));
      return matchesSearch && matchesStatus && matchesPriority && matchesAssignee;
    }),
  }));

  function openCreateTask() {
    setCreateTaskOpen(true);
  }

  function addCreatedTask(task: Task, statusId: number) {
    setWorkspaceGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === statusId &&
        !group.tasks.some((currentTask) => currentTask.id === task.id)
          ? { ...group, tasks: [...group.tasks, task] }
          : group,
      ),
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0f0f10] text-white">
      <header className="flex h-[76px] items-center justify-between border-b border-white/10 bg-[#111111] px-6 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] text-white/55">
            <span className="rounded bg-[#4f46e5] px-1.5 py-0.5 text-[11px] font-semibold text-white">
              T
            </span>
            <span>{workspaceName}</span>
            <span>/</span>
            <span className="font-semibold text-white">{projectName}</span>
            <ChevronDownIcon className="size-3.5 text-white/45" />
            <button type="button" onClick={() => void togglePin()} disabled={pinBusy} aria-label={isPinned ? "Unpin project" : "Pin project"} aria-pressed={isPinned} className={`rounded p-0.5 transition hover:bg-white/10 hover:text-white disabled:opacity-50 ${isPinned ? "text-violet-300" : "text-white/45"}`}>
              <Pin className={`size-4 ${isPinned ? "fill-current" : ""}`} />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3 text-[13px] font-semibold text-white/60">
            <button className="rounded-md border border-white/10 px-2.5 py-1 text-white/45 transition hover:bg-white/5">
              Add Channel
            </button>
            <ViewTab
              active={viewMode === "list"}
              href={`/team/projects/${projectSlug}/v/l/${viewSlug}`}
              icon={<ClipboardDocumentListIcon className="size-3.5" />}
              label="List"
            />
            <ViewTab
              active={viewMode === "board"}
              href={`/team/projects/${projectSlug}/v/b/${viewSlug}`}
              icon={<Squares2X2Icon className="size-3.5 text-[#5b6cff]" />}
              label="Board"
            />
            <ViewTab
              active={viewMode === "timeline"}
              href={`/team/projects/${projectSlug}/v/tl/${viewSlug}`}
              icon={<CalendarDaysIcon className="size-3.5 text-orange-400" />}
              label="Timeline"
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 text-[13px] font-semibold text-white/55">
          <button className="transition hover:text-white">Share</button>
        </div>
      </header>

      <section className="flex min-h-11 items-center justify-end border-b border-white/10 bg-[#101010] px-4 py-2">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-white/65">
          <TaskToolbar groups={workspaceGroups} members={toolbarMembers} searchQuery={searchQuery} setSearchQuery={setSearchQuery} statusFilters={statusFilters} setStatusFilters={setStatusFilters} priorityFilters={priorityFilters} setPriorityFilters={setPriorityFilters} assigneeFilter={assigneeFilter} setAssigneeFilter={setAssigneeFilter} />
          {canManageProject ? <button
            type="button"
            onClick={openCreateTask}
            className="primary-add-task flex items-center gap-1.5 rounded-md border border-white bg-white px-2.5 py-1 font-semibold text-black transition hover:bg-white/85"
          >
            Add Task
            <ChevronDownIcon className="size-3.5" />
          </button> : null}
        </div>
      </section>

      {viewMode === "list" ? (
        <ListView
          groups={filteredGroups}
          setGroups={setWorkspaceGroups}
          projectId={projectId}
          workspaceId={workspaceId}
          projectName={projectName}
          canManageProject={canManageProject}
        />
      ) : null}
      {viewMode === "board" ? (
        <BoardView
          groups={filteredGroups}
          setGroups={setWorkspaceGroups}
          projectId={projectId}
          workspaceId={workspaceId}
          onAddTask={openCreateTask}
          canManageProject={canManageProject}
        />
      ) : null}
      {viewMode === "timeline" ? (
        <TimelineView
          groups={filteredGroups}
          setGroups={setWorkspaceGroups}
          projectId={projectId}
          workspaceId={workspaceId}
          members={toolbarMembers}
        />
      ) : null}
      {canManageProject ? <CreateTaskModal
        open={createTaskOpen}
        projectId={projectId}
        workspaceId={workspaceId}
        projectName={projectName}
        groups={workspaceGroups}
        onCreated={addCreatedTask}
        onClose={() => setCreateTaskOpen(false)}
      /> : null}
    </div>
  );
}

function ViewTab({
  active,
  href,
  icon,
  label,
}: {
  active: boolean;
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-1 px-1.5 pb-2 transition hover:text-white ${
        active ? "border-b-2 border-white text-white" : "text-white/60"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

function TaskToolbar({
  groups,
  members,
  searchQuery,
  setSearchQuery,
  statusFilters,
  setStatusFilters,
  priorityFilters,
  setPriorityFilters,
  assigneeFilter,
  setAssigneeFilter,
}: {
  groups: StatusGroup[];
  members: ProjectMember[];
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  statusFilters: number[];
  setStatusFilters: Dispatch<SetStateAction<number[]>>;
  priorityFilters: string[];
  setPriorityFilters: Dispatch<SetStateAction<string[]>>;
  assigneeFilter: number | "unassigned" | null;
  setAssigneeFilter: Dispatch<SetStateAction<number | "unassigned" | null>>;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const activeFilterCount = statusFilters.length + priorityFilters.length;
  const selectedAssignee = typeof assigneeFilter === "number"
    ? members.find((member) => member.id === assigneeFilter)
    : null;

  return (
    <>
      <div className="relative">
        <button type="button" onClick={() => { setFilterOpen((open) => !open); setAssigneeOpen(false); }} className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 transition hover:bg-white/5 ${activeFilterCount ? "border-violet-400/40 bg-violet-500/15 text-violet-200" : "border-white/10"}`}>
          <FunnelIcon className="size-3.5" />
          Filter{activeFilterCount ? ` · ${activeFilterCount}` : ""}
        </button>
        {filterOpen ? (
          <div className="absolute right-0 top-8 z-50 w-64 rounded-xl border border-white/10 bg-[#1b1b1d] p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-white/45">Status</span>
              {activeFilterCount ? <button type="button" onClick={() => { setStatusFilters([]); setPriorityFilters([]); }} className="text-xs text-red-300 hover:text-red-200">Reset</button> : null}
            </div>
            <div className="space-y-1">
              {groups.map((group) => (
                <label key={group.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 font-normal hover:bg-white/5">
                  <input type="checkbox" checked={statusFilters.includes(group.id)} onChange={() => setStatusFilters((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id])} className="accent-violet-500" />
                  <span className={`size-2 rounded-full ${statusColorClass(group.tone, "swatch")}`} />
                  <span>{group.label}</span>
                </label>
              ))}
            </div>
            <p className="mb-1 mt-3 text-xs text-white/45">Priority</p>
            <div className="space-y-1">
              {["urgent", "high", "normal", "low"].map((priority) => (
                <label key={priority} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 font-normal capitalize hover:bg-white/5">
                  <input type="checkbox" checked={priorityFilters.includes(priority)} onChange={() => setPriorityFilters((current) => current.includes(priority) ? current.filter((item) => item !== priority) : [...current, priority])} className="accent-violet-500" />
                  <FlagIcon className={`size-3.5 ${priorityColorClass(priority)}`} />
                  {priority}
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative">
        <button type="button" onClick={() => { setAssigneeOpen((open) => !open); setFilterOpen(false); }} className={`max-w-40 truncate rounded-full border px-2.5 py-0.5 transition hover:bg-white/5 ${assigneeFilter !== null ? "border-violet-400/40 bg-violet-500/15 text-violet-200" : "border-white/10"}`}>
          {assigneeFilter === "unassigned" ? "Tanpa assignee" : selectedAssignee?.name ?? "Assignee"}
        </button>
        {assigneeOpen ? (
          <div className="absolute right-0 top-8 z-50 max-h-72 w-60 overflow-y-auto rounded-xl border border-white/10 bg-[#1b1b1d] p-1.5 shadow-2xl">
            <button type="button" onClick={() => { setAssigneeFilter(null); setAssigneeOpen(false); }} className="w-full rounded-md px-2 py-2 text-left font-normal hover:bg-white/5">Semua assignee</button>
            <button type="button" onClick={() => { setAssigneeFilter("unassigned"); setAssigneeOpen(false); }} className="w-full rounded-md px-2 py-2 text-left font-normal hover:bg-white/5">Tanpa assignee</button>
            {members.map((member) => (
              <button key={member.id} type="button" onClick={() => { setAssigneeFilter(member.id); setAssigneeOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left font-normal hover:bg-white/5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px]">{getInitials(member.name)}</span>
                <span className="truncate">{member.name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex items-center">
        {searchOpen ? <input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setSearchQuery(""); setSearchOpen(false); } }} placeholder="Cari task..." className="h-7 w-44 rounded-l-md border border-r-0 border-white/10 bg-white/5 px-2 text-xs font-normal text-white outline-none focus:border-white/25" /> : null}
        <button type="button" aria-label={searchOpen ? "Tutup pencarian" : "Cari task"} onClick={() => { if (searchOpen) setSearchQuery(""); setSearchOpen((open) => !open); }} className={`flex size-7 items-center justify-center border border-white/10 transition hover:bg-white/5 ${searchOpen ? "rounded-r-md bg-white/5" : "rounded-md"}`}>
          {searchOpen ? <XMarkIcon className="size-3.5" /> : <MagnifyingGlassIcon className="size-3.5" />}
        </button>
      </div>
    </>
  );
}

function ListView({
  groups,
  setGroups,
  projectId,
  workspaceId,
  projectName,
  canManageProject,
}: {
  groups: StatusGroup[];
  setGroups: Dispatch<SetStateAction<StatusGroup[]>>;
  projectId: number;
  workspaceId: number;
  projectName: string;
  canManageProject: boolean;
}) {
  const [collapsedStatusIds, setCollapsedStatusIds] = useState<number[]>([]);
  const [listDraggingTaskId, setListDraggingTaskId] = useState<number | null>(null);
  const [listDropTarget, setListDropTarget] = useState<number | null>(null);
  const [listDragError, setListDragError] = useState("");
  const listMoveBusy = useRef(false);
  const [statusManagerOpen, setStatusManagerOpen] = useState(false);
  const [addingStatusCategory, setAddingStatusCategory] =
    useState<StatusCategory | null>(null);
  const [newStatusCategory, setNewStatusCategory] =
    useState<StatusCategory>("active");
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("teal");
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [newStatusError, setNewStatusError] = useState("");
  const [creatingStatus, setCreatingStatus] = useState(false);
  const [inlineTaskStatusId, setInlineTaskStatusId] = useState<number | null>(
    null,
  );
  const [inlineTaskName, setInlineTaskName] = useState("");
  const [creatingInlineTask, setCreatingInlineTask] = useState(false);
  const [openGroupOptionsId, setOpenGroupOptionsId] = useState<number | null>(
    null,
  );
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [openTaskAssigneeId, setOpenTaskAssigneeId] = useState<number | null>(
    null,
  );
  const [openTaskDateId, setOpenTaskDateId] = useState<number | null>(null);
  const [activeTaskDateField, setActiveTaskDateField] = useState<
    "start" | "due"
  >("due");
  const [openTaskPriorityId, setOpenTaskPriorityId] = useState<number | null>(
    null,
  );
  const [openTaskStatusId, setOpenTaskStatusId] = useState<number | null>(null);
  const [statusSearch, setStatusSearch] = useState("");
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
  const [workspaceTags, setWorkspaceTags] = useState<WorkspaceTag[]>([]);
  const [savingStatusChanges, setSavingStatusChanges] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/members`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { members?: ProjectMember[] } | null) => {
        setMembers(data?.members ?? []);
      })
      .catch(() => setMembers([]));
  }, [projectId]);

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/tags`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { tags?: WorkspaceTag[] } | null) => {
        setWorkspaceTags(data?.tags ?? []);
      })
      .catch(() => setWorkspaceTags([]));
  }, [workspaceId]);

  async function createWorkspaceTag(name: string) {
    const tagName = name.trim();

    if (!tagName) {
      return null;
    }

    const existingTag = workspaceTags.find(
      (tag) => tag.name.toLowerCase() === tagName.toLowerCase(),
    );

    if (existingTag) {
      return existingTag;
    }

    const response = await fetch(`/api/workspaces/${workspaceId}/tags`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: tagName }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { tag?: WorkspaceTag };

    if (data.tag) {
      setWorkspaceTags((currentTags) => [...currentTags, data.tag!]);
      return data.tag;
    }

    return null;
  }

  useEffect(() => {
    function closeFloatingPopovers(event: PointerEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.closest("[data-floating-popover]")) {
        return;
      }

      setOpenGroupOptionsId(null);
      setOpenTaskAssigneeId(null);
      setOpenTaskDateId(null);
      setOpenTaskPriorityId(null);
      setOpenTaskStatusId(null);
    }

    function closeFloatingPopoversOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      setOpenGroupOptionsId(null);
      setOpenTaskAssigneeId(null);
      setOpenTaskDateId(null);
      setOpenTaskPriorityId(null);
      setOpenTaskStatusId(null);
      setStatusManagerOpen(false);
      setStatusSearch("");
    }

    document.addEventListener("pointerdown", closeFloatingPopovers);
    window.addEventListener("keydown", closeFloatingPopoversOnEscape, true);

    return () => {
      document.removeEventListener("pointerdown", closeFloatingPopovers);
      window.removeEventListener("keydown", closeFloatingPopoversOnEscape, true);
    };
  }, []);

  async function createStatus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newStatusName.trim()) {
      return;
    }

    setNewStatusError("");
    setCreatingStatus(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/statuses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newStatusName,
          color: newStatusColor,
          category: newStatusCategory,
        }),
      });

      const responseText = await response.text();
      const data = (responseText ? JSON.parse(responseText) : {}) as {
        error?: string;
        status?: {
          id: number;
          name: string;
          color: string;
          category: StatusCategory;
        };
      };

      if (response.ok && data.status) {
        setGroups((currentGroups) =>
          sortStatusGroups([
            ...currentGroups,
            {
              id: data.status!.id,
              label: data.status!.name,
              tone: data.status!.color,
              category: data.status!.category,
              isDefault: false,
              tasks: [],
            },
          ]),
        );
        setNewStatusName("");
        setNewStatusColor("teal");
        setColorPickerOpen(false);
        setNewStatusError("");
        setAddingStatusCategory(null);
      } else {
        setNewStatusError(data.error ?? "Gagal membuat status.");
      }
    } catch {
      setNewStatusError("Gagal membuat status.");
    } finally {
      setCreatingStatus(false);
    }
  }

  async function createInlineTask(status: StatusGroup) {
    const taskName = inlineTaskName.trim();

    if (!taskName) {
      setInlineTaskStatusId(null);
      setInlineTaskName("");
      return;
    }

    if (creatingInlineTask) {
      return;
    }

    setCreatingInlineTask(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          statusId: status.id,
          name: taskName,
        }),
      });

      const responseText = await response.text();
      const data = (responseText ? JSON.parse(responseText) : {}) as {
        task?: Task;
      };

      if (response.ok && data.task) {
        setGroups((currentGroups) =>
          currentGroups.map((group) =>
            group.id === status.id
              ? { ...group, tasks: [...group.tasks, data.task!] }
              : group,
          ),
        );
        setInlineTaskStatusId(null);
        setInlineTaskName("");
      }
    } finally {
      setCreatingInlineTask(false);
    }
  }

  function updateTaskFields(
    taskId: number,
    updates: Partial<
      Pick<
        Task,
        "name" | "description" | "assigneeId" | "assigneeIds" | "assignee" | "startDate" | "dueDate" | "due" | "priority" | "tags" | "attachments"
      >
    >,
  ) {
    setGroups((currentGroups) =>
      currentGroups.map((group) => ({
        ...group,
        tasks: group.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                ...updates,
              }
            : task,
        ),
      })),
    );
  }

  async function patchTask(
    taskId: number,
    body: Record<string, string | number | null | string[] | number[]>,
  ) {
    await fetch(`/api/projects/${projectId}/tasks`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskId,
        ...body,
      }),
    });
  }

  function moveTaskToStatus(task: Task, nextStatus: StatusGroup) {
    setGroups((currentGroups) =>
      currentGroups.map((group) => {
        if (group.id === nextStatus.id) {
          return {
            ...group,
            tasks: [
              ...group.tasks.filter((groupTask) => groupTask.id !== task.id),
              {
                ...task,
                status: nextStatus.label,
                tone: nextStatus.tone,
              },
            ],
          };
        }

        return {
          ...group,
          tasks: group.tasks.filter((groupTask) => groupTask.id !== task.id),
        };
      }),
    );
  }

  async function persistStatusOrder(nextGroups: StatusGroup[]) {
    const response = await fetch(`/api/projects/${projectId}/statuses`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        statuses: nextGroups.map((group, index) => ({
          id: group.id,
          category: group.category,
          position: index + 1,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to save status changes");
    }
  }

  async function applyStatusChanges() {
    setSavingStatusChanges(true);

    try {
      await persistStatusOrder(groups);
      setStatusManagerOpen(false);
    } finally {
      setSavingStatusChanges(false);
    }
  }

  function moveStatus(
    draggingStatusId: number,
    targetCategory: StatusCategory,
    targetGroup?: StatusGroup,
  ) {
    if (targetGroup && draggingStatusId === targetGroup.id) {
      return;
    }

    setGroups((currentGroups) => {
      const draggingGroup = currentGroups.find(
        (group) => group.id === draggingStatusId,
      );

      if (!draggingGroup) {
        return currentGroups;
      }

      const otherGroups = currentGroups.filter(
        (group) => group.id !== draggingStatusId && group.category !== targetCategory,
      );
      const targetCategoryGroups = currentGroups.filter(
        (group) => group.id !== draggingStatusId && group.category === targetCategory,
      );
      const targetIndex = targetGroup
        ? targetCategoryGroups.findIndex((group) => group.id === targetGroup.id)
        : targetCategoryGroups.length;
      const movedGroup = {
        ...draggingGroup,
        category: targetCategory,
      };
      const reorderedCategoryGroups = [...targetCategoryGroups];

      reorderedCategoryGroups.splice(
        targetIndex < 0 ? reorderedCategoryGroups.length : targetIndex,
        0,
        movedGroup,
      );
      const nextGroups = STATUS_CATEGORIES.flatMap((category) =>
        category === targetCategory
          ? reorderedCategoryGroups
          : otherGroups.filter((group) => group.category === category),
      );

      return nextGroups;
    });
  }

  const requiredDefaultStatuses = new Set(["TO DO", "IN PROGRESS", "COMPLETE"]);
  const visibleGroups = groups.filter(
    (group) =>
      group.tasks.length > 0 ||
      requiredDefaultStatuses.has(group.label) ||
      !group.isDefault,
  );
  const detailTask =
    groups.flatMap((group) => group.tasks).find((task) => task.id === detailTaskId) ??
    null;

  return (
    <main className="flex-1 px-8 py-5">
      {listDragError && <p role="alert" className="mb-3 text-sm text-red-400">{listDragError}</p>}
      <div className="space-y-4">
        {visibleGroups.map((group, index) => {
          const showCategory =
            index === 0 || group.category !== visibleGroups[index - 1].category;

          return (
            <section key={group.label}
              className={`rounded-lg transition-colors duration-150 motion-reduce:transition-none ${listDropTarget === group.id ? "bg-white/5" : ""}`}
              onDragOver={event => {
                if (listDraggingTaskId === null) return;
                event.preventDefault(); event.dataTransfer.dropEffect = "move"; setListDropTarget(group.id);
              }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setListDropTarget(null); }}
              onDrop={async event => {
                if (listDraggingTaskId === null) return;
                event.preventDefault();
                const source = groups.find(item => item.tasks.some(task => task.id === listDraggingTaskId));
                const task = source?.tasks.find(item => item.id === listDraggingTaskId);
                setListDraggingTaskId(null); setListDropTarget(null);
                if (!task || source?.id === group.id || listMoveBusy.current) return;
                listMoveBusy.current = true; setListDragError("");
                try {
                  const response = await fetch(`/api/projects/${projectId}/tasks`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id, statusId: group.id }) });
                  if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Gagal memindahkan task."); }
                  moveTaskToStatus(task, group);
                } catch (error) { setListDragError(error instanceof Error ? error.message : "Gagal memindahkan task."); }
                finally { listMoveBusy.current = false; }
              }}
            >
              {showCategory ? (
                <p className="mb-2 pl-10 text-[11px] font-semibold uppercase tracking-wide text-white/30">
                  {STATUS_CATEGORY_LABELS[group.category]}
                </p>
              ) : null}
              <div className="group/status-header relative mb-2 flex items-center gap-2">
                <button type="button"
                  aria-label={`${collapsedStatusIds.includes(group.id) ? "Buka" : "Lipat"} ${group.label}`}
                  aria-expanded={!collapsedStatusIds.includes(group.id)}
                  aria-controls={`status-tasks-${group.id}`}
                  onClick={() => setCollapsedStatusIds(current => current.includes(group.id) ? current.filter(id => id !== group.id) : [...current, group.id])}
                  className="flex size-5 items-center justify-center rounded text-white/45 hover:bg-white/10 hover:text-white"
                >
                  <ChevronDownIcon className={`size-3.5 transition-transform motion-reduce:transition-none ${collapsedStatusIds.includes(group.id) ? "-rotate-90" : ""}`} />
                </button>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusColorClass(group.tone, "badge")}`}
                >
                  {group.label}
                </span>
                <span className="text-sm text-white/40">{group.tasks.length}</span>
                <button
                  type="button"
                  data-floating-popover
                  onClick={() =>
                    setOpenGroupOptionsId((currentId) =>
                      currentId === group.id ? null : group.id,
                    )
                  }
                  className="ml-1 flex size-5.5 items-center justify-center rounded text-white/0 opacity-0 transition group-hover/status-header:text-white/55 group-hover/status-header:opacity-100 hover:bg-white/10 hover:text-white"
                  title="Group options"
                  aria-label="Group options"
                >
                  <span className="flex items-center gap-0.5">
                    <span className="size-0.5 rounded-full bg-current" />
                    <span className="size-0.5 rounded-full bg-current" />
                    <span className="size-0.5 rounded-full bg-current" />
                  </span>
                </button>
                {openGroupOptionsId === group.id ? (
                  <div data-floating-popover className="absolute left-24 top-7 z-30 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#191919] py-1 shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
                    <p className="px-3 py-2 text-xs font-semibold text-white/35">
                      Group options
                    </p>
                    <button className="flex w-full items-center px-3 py-2 text-left text-sm text-white/85 hover:bg-white/10">
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenGroupOptionsId(null);
                        setStatusManagerOpen(true);
                      }}
                      className="flex w-full items-center px-3 py-2 text-left text-sm text-white/85 hover:bg-white/10"
                    >
                      Edit status
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setCollapsedStatusIds(current => current.filter(id => id !== group.id));
                    setInlineTaskStatusId(group.id);
                    setInlineTaskName("");
                  }}
                  className="flex size-5.5 items-center justify-center rounded text-white/0 opacity-0 transition group-hover/status-header:text-white/55 group-hover/status-header:opacity-100 hover:bg-white/10 hover:text-white"
                  aria-label={`Add task to ${group.label}`}
                >
                  <PlusIcon className="size-3.5" />
                </button>
              </div>

            <div id={`status-tasks-${group.id}`} hidden={collapsedStatusIds.includes(group.id)} className="ml-10">
              <div className="grid grid-cols-[560px_104px_150px_90px_124px] border-b border-white/10 px-1.5 pb-1.5 text-xs font-semibold text-white/35">
                <span>Name</span>
                <span>Assignee</span>
                <span>Due date</span>
                <span>Priority</span>
                <span>Status</span>
              </div>

              {group.tasks.map((task) => (
                <div
                  key={task.id}
                  className={`grid grid-cols-[560px_104px_150px_90px_124px] items-center border-b border-white/10 px-1.5 py-1.5 text-sm text-white/70 transition-opacity duration-150 motion-reduce:transition-none hover:bg-white/5 ${listDraggingTaskId === task.id ? "opacity-30" : "opacity-100"}`}
                >
                  <div className="relative min-w-0">
                    <button type="button" draggable aria-label={`Tarik ${task.name} untuk mengubah status`} title="Tarik ke status lain"
                      className="absolute left-0 top-1/2 flex size-6 -translate-y-1/2 cursor-grab items-center justify-center text-white/40 hover:text-white active:cursor-grabbing"
                      onDragStart={event => { if (listMoveBusy.current) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(task.id));
                        const preview = document.createElement("div");
                        preview.textContent = task.name;
                        preview.style.cssText = "position:fixed;left:-10000px;top:0;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:12px 18px;border:1px solid #71717a;border-radius:8px;background:#27272a;color:#fff;font:500 13px system-ui;box-shadow:0 8px 24px #0004";
                        document.body.append(preview); event.dataTransfer.setDragImage(preview, 24, 20);
                        requestAnimationFrame(() => preview.remove());
                        setListDraggingTaskId(task.id); }}
                      onDragEnd={() => { setListDraggingTaskId(null); setListDropTarget(null); }}
                    ><span aria-hidden="true">⠿</span></button>
                  <button
                    type="button"
                    onClick={() => setDetailTaskId(task.id)}
                    className="flex min-w-0 items-center gap-2.5 rounded-md py-1 pl-8 text-left font-semibold text-white/80 outline-none transition hover:text-white focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
                  >
                    <span
                      className={`size-3.5 shrink-0 rounded-full border-2 ${statusDotClass(
                        task.tone,
                        group.category,
                      )}`}
                    />
                    <span className="whitespace-nowrap">{truncateTaskName(task.name)}</span>
                  </button>
                  </div>
                  <span className="relative">
                    <button
                      type="button"
                      data-floating-popover
                      onClick={() =>
                        setOpenTaskAssigneeId((currentId) =>
                          currentId === task.id ? null : task.id,
                        )
                      }
                      className="flex h-8 w-full items-center rounded-md px-2 transition hover:bg-white/10"
                    >
                      <AssigneeAvatars assignee={task.assignee} />
                    </button>
                    {openTaskAssigneeId === task.id ? (
                      <div data-floating-popover className="absolute left-0 top-8 z-40 w-56 rounded-lg border border-white/10 bg-[#202020] p-1 shadow-xl">
                        {members.length ? (
                          members.map((member) => {
                            const selectedAssigneeIds = getTaskAssigneeIds(task);
                            const isSelected = selectedAssigneeIds.includes(member.id);

                            return (
                            <button
                              key={member.id}
                              type="button"
                              onClick={() => {
                                const nextAssigneeIds = isSelected
                                  ? selectedAssigneeIds.filter((id) => id !== member.id)
                                  : [...selectedAssigneeIds, member.id];

                                updateTaskFields(task.id, {
                                  assigneeId: nextAssigneeIds[0] ?? null,
                                  assigneeIds: nextAssigneeIds,
                                  assignee: getAssigneeInitials(nextAssigneeIds, members),
                                });
                                void patchTask(task.id, {
                                  assigneeIds: nextAssigneeIds,
                                });
                              }}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold hover:bg-white/10 ${
                                isSelected ? "bg-white/10 text-white" : "text-white/75"
                              }`}
                            >
                              <span className="flex size-5 items-center justify-center rounded-full bg-white text-[10px] text-black">
                                {getInitials(member.name)}
                              </span>
                              <span className="truncate">{member.name}</span>
                              <span className={`ml-auto size-2 rounded-full ${isSelected ? "bg-violet-500" : "bg-transparent"}`} />
                            </button>
                            );
                          })
                        ) : (
                          <p className="px-2 py-1.5 text-xs text-white/40">
                            Belum ada member
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            void updateTaskFields(task.id, {
                              assigneeId: null,
                              assigneeIds: [],
                              assignee: "",
                            });
                            void patchTask(task.id, {
                              assigneeIds: [],
                            });
                            setOpenTaskAssigneeId(null);
                          }}
                          className="mt-1 flex w-full items-center gap-2 border-t border-white/10 px-2 py-1.5 text-left text-xs font-semibold text-white/50 hover:bg-white/10"
                        >
                          Clear
                        </button>
                      </div>
                    ) : null}
                  </span>
                  <span className="relative">
                    <button
                      type="button"
                      data-floating-popover
                      onClick={(event) => {
                        event.currentTarget.blur();
                        setActiveTaskDateField("due");
                        setOpenTaskDateId((currentId) =>
                          currentId === task.id ? null : task.id,
                        );
                      }}
                      className={`flex h-8 w-full items-center gap-1.5 rounded-md px-2 transition hover:bg-white/10 ${
                        task.dueDate &&
                        task.dueDate < TODAY_ISO &&
                        group.category !== "closed"
                          ? "text-red-400 hover:text-red-300"
                          : "text-white/45 hover:text-white/80"
                      }`}
                    >
                      <CalendarDaysIcon className="size-4" />
                      {task.startDate && task.dueDate ? (
                        <span className="truncate text-xs font-semibold">
                          {formatNumericDate(task.startDate)} -{" "}
                          {formatNumericDate(task.dueDate)}
                        </span>
                      ) : task.dueDate ? (
                        <span className="text-xs font-semibold">
                          {formatNumericDate(task.dueDate)}
                        </span>
                      ) : null}
                    </button>
                    {openTaskDateId === task.id ? (
                      <DatePickerPopover
                        startDate={task.startDate ?? ""}
                        dueDate={task.dueDate ?? ""}
                        activeField={activeTaskDateField}
                        onActiveFieldChange={setActiveTaskDateField}
                        onSelect={(date) => {
                          if (activeTaskDateField === "start") {
                            const isAfterDueDate = Boolean(
                              task.dueDate && date > task.dueDate,
                            );

                            if (isAfterDueDate) {
                              void updateTaskFields(task.id, {
                                startDate: "",
                              });
                              void patchTask(task.id, {
                                startDate: "",
                              });
                              setActiveTaskDateField("due");
                              return;
                            }

                            void updateTaskFields(task.id, {
                              startDate: date,
                            });
                            void patchTask(task.id, {
                              startDate: date,
                            });
                            setActiveTaskDateField("due");
                            return;
                          }

                          const clearsStartDate = Boolean(
                            task.startDate && date < task.startDate,
                          );
                          void updateTaskFields(task.id, {
                            ...(clearsStartDate ? { startDate: "" } : {}),
                            due: date ? formatNumericDate(date) : "",
                            dueDate: date,
                          });
                          void patchTask(task.id, {
                            ...(clearsStartDate ? { startDate: "" } : {}),
                            dueDate: date,
                          });
                        }}
                        onClear={(field) => {
                          if (field === "start") {
                            void updateTaskFields(task.id, {
                              startDate: "",
                            });
                            void patchTask(task.id, {
                              startDate: "",
                            });
                            return;
                          }

                          void updateTaskFields(task.id, {
                            startDate: "",
                            due: "",
                            dueDate: "",
                          });
                          void patchTask(task.id, {
                            startDate: "",
                            dueDate: "",
                          });
                        }}
                      />
                    ) : null}
                  </span>
                  <span className="relative">
                    <button
                      type="button"
                      data-floating-popover
                      onClick={() =>
                        setOpenTaskPriorityId((currentId) =>
                          currentId === task.id ? null : task.id,
                        )
                      }
                      className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-white/45 transition hover:bg-white/10 hover:text-white/80"
                    >
                      <span className={priorityColorClass(task.priority)}>⚑</span>
                      {task.priority ? (
                        <span className={`text-xs font-semibold ${priorityColorClass(task.priority)}`}>
                          {task.priority}
                        </span>
                      ) : null}
                    </button>
                    {openTaskPriorityId === task.id ? (
                      <PriorityPopover
                        onSelect={(priority) => {
                          void updateTaskFields(task.id, { priority });
                          void patchTask(task.id, { priority });
                          setOpenTaskPriorityId(null);
                        }}
                      />
                    ) : null}
                  </span>
                  <span className="relative">
                    <button
                      type="button"
                      data-floating-popover
                      onClick={() => {
                        setOpenTaskStatusId((currentId) =>
                          currentId === task.id ? null : task.id,
                        );
                        setStatusSearch("");
                      }}
                      className="flex h-8 w-full items-center rounded-md px-2 transition hover:bg-white/10"
                    >
                      <StatusBadge task={task} />
                    </button>
                    {openTaskStatusId === task.id ? (
                      <StatusPickerPopover
                        groups={groups}
                        currentStatus={task.status}
                        search={statusSearch}
                        onSearchChange={setStatusSearch}
                        onSelect={(nextStatus) => {
                          moveTaskToStatus(task, nextStatus);
                          void patchTask(task.id, {
                            statusId: nextStatus.id,
                          });
                          setOpenTaskStatusId(null);
                          setStatusSearch("");
                        }}
                      />
                    ) : null}
                  </span>
                </div>
              ))}

              {inlineTaskStatusId === group.id ? (
                <div className="grid grid-cols-[560px_104px_150px_90px_124px] items-center border-b border-white/10 px-1.5 py-1.5 text-sm text-white/70">
                  <span className="flex items-center gap-2.5 pl-8 font-semibold text-white/80">
                    <span className="size-3.5 rounded-full border-2 border-dashed border-white/40" />
                    <input
                      value={inlineTaskName}
                      onChange={(event) => setInlineTaskName(event.target.value)}
                      onBlur={() => {
                        void createInlineTask(group);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }

                        if (event.key === "Escape") {
                          event.currentTarget.blur();
                          setInlineTaskStatusId(null);
                          setInlineTaskName("");
                        }
                      }}
                      autoFocus
                      placeholder="New task"
                      className="h-7 min-w-0 flex-1 rounded-md border border-white/10 bg-[#151515] px-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/35"
                    />
                  </span>
                  <span />
                  <span />
                  <span />
                  <span>
                    <StatusBadge
                      task={{
                        id: 0,
                        name: inlineTaskName,
                        description: "",
                        assigneeId: null,
                        assignee: "",
                        due: "",
                        dueDate: "",
                        priority: "",
                        tags: [],
                        status: group.label,
                        tone: group.tone,
                      }}
                    />
                  </span>
                </div>
              ) : null}

              {canManageProject ? <button
                type="button"
                onClick={() => {
                  setInlineTaskStatusId(group.id);
                  setInlineTaskName("");
                }}
                className="flex items-center gap-2.5 px-9 py-2 text-[13px] text-white/45 transition hover:text-white"
              >
                <PlusIcon className="size-3.5" />
                Add Task
              </button> : null}
            </div>
          </section>
          );
        })}
        {canManageProject ? <div className="group/new-status min-h-9">
          <button
            type="button"
            onClick={() => setStatusManagerOpen(true)}
            className="flex items-center gap-2 px-8 py-2 text-[13px] text-white/40 opacity-0 transition hover:text-white group-hover/new-status:opacity-100"
          >
            <PlusIcon className="size-3.5" />
            New status
          </button>
        </div> : null}
      </div>
      <StatusManagerPanel
        open={statusManagerOpen}
        groups={groups}
        projectName={projectName}
        newStatusName={newStatusName}
        newStatusColor={newStatusColor}
        newStatusCategory={newStatusCategory}
        addingStatusCategory={addingStatusCategory}
        colorPickerOpen={colorPickerOpen}
        creatingStatus={creatingStatus}
        newStatusError={newStatusError}
        onClose={() => {
          setStatusManagerOpen(false);
          setNewStatusName("");
          setNewStatusError("");
          setAddingStatusCategory(null);
          setColorPickerOpen(false);
        }}
        onCreateStatus={createStatus}
        onStartAdd={(category) => {
          setAddingStatusCategory(category);
          setNewStatusCategory(category);
          setNewStatusName("");
          setNewStatusError("");
          setColorPickerOpen(false);
        }}
        onNameChange={setNewStatusName}
        onColorChange={(color) => {
          setNewStatusColor(color);
          setColorPickerOpen(false);
        }}
        onToggleColorPicker={() => setColorPickerOpen((open) => !open)}
        onCancelAdd={() => {
          setAddingStatusCategory(null);
          setNewStatusName("");
          setNewStatusError("");
          setColorPickerOpen(false);
        }}
        onMoveStatus={moveStatus}
        onApplyChanges={applyStatusChanges}
        savingStatusChanges={savingStatusChanges}
      />
      <TaskDetailModal
        key={detailTask?.id ?? "empty-task-detail"}
        task={detailTask}
        groups={groups}
        members={members}
        workspaceTags={workspaceTags}
        projectId={projectId}
        onCreateWorkspaceTag={createWorkspaceTag}
        onUpdateTask={updateTaskFields}
        onPatchTask={patchTask}
        onMoveTaskToStatus={moveTaskToStatus}
        onClose={() => setDetailTaskId(null)}
      />
    </main>
  );
}

function StatusManagerPanel({
  open,
  groups,
  projectName,
  newStatusName,
  newStatusColor,
  newStatusCategory,
  addingStatusCategory,
  colorPickerOpen,
  creatingStatus,
  newStatusError,
  onClose,
  onCreateStatus,
  onStartAdd,
  onNameChange,
  onColorChange,
  onToggleColorPicker,
  onCancelAdd,
  onMoveStatus,
  onApplyChanges,
  savingStatusChanges,
}: {
  open: boolean;
  groups: StatusGroup[];
  projectName: string;
  newStatusName: string;
  newStatusColor: string;
  newStatusCategory: StatusCategory;
  addingStatusCategory: StatusCategory | null;
  colorPickerOpen: boolean;
  creatingStatus: boolean;
  newStatusError: string;
  onClose: () => void;
  onCreateStatus: (event: React.FormEvent<HTMLFormElement>) => void;
  onStartAdd: (category: StatusCategory) => void;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onToggleColorPicker: () => void;
  onCancelAdd: () => void;
  onMoveStatus: (
    draggingStatusId: number,
    targetCategory: StatusCategory,
    targetGroup?: StatusGroup,
  ) => void;
  onApplyChanges: () => void;
  savingStatusChanges: boolean;
}) {
  const [draggingStatusId, setDraggingStatusId] = useState<number | null>(null);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 transition ${
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      onPointerDown={onClose}
      aria-hidden={!open}
    >
      <section
        role="dialog"
        aria-modal="true"
        onPointerDown={(event) => event.stopPropagation()}
        className={`flex h-[74vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#111111] text-white shadow-2xl transition duration-200 ${
          open ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-95 opacity-0"
        }`}
      >
        <header className="flex h-12 items-center justify-between border-b border-white/10 px-5">
          <h2 className="text-base font-semibold text-white">
            Edit {projectName} status
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/15 hover:text-white"
            aria-label="Close statuses"
          >
            <XMarkIcon className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
            <div className="space-y-6">
            {STATUS_CATEGORIES.map((category) => {
              const categoryGroups = groups.filter(
                (group) => group.category === category,
              );
              const isAdding = addingStatusCategory === category;

              return (
                <section key={category}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-white/45">
                      {STATUS_CATEGORY_LABELS[category]}
                      <span className="flex size-3.5 items-center justify-center rounded-full bg-white/35 text-[10px] font-bold text-black">
                        i
                      </span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => onStartAdd(category)}
                      className="flex size-6 items-center justify-center rounded text-white/55 hover:bg-white/10 hover:text-white"
                      aria-label={`Add status to ${STATUS_CATEGORY_LABELS[category]}`}
                    >
                      <PlusIcon className="size-4.5" />
                    </button>
                  </div>

                  <div
                    className="space-y-2"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggingStatusId) {
                        onMoveStatus(draggingStatusId, category);
                        setDraggingStatusId(null);
                      }
                    }}
                  >
                    {categoryGroups.map((group) => (
                      <div
                        key={group.id}
                        draggable
                        onDragStart={() => setDraggingStatusId(group.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.stopPropagation();
                          if (draggingStatusId) {
                            onMoveStatus(draggingStatusId, category, group);
                            setDraggingStatusId(null);
                          }
                        }}
                        onDragEnd={() => setDraggingStatusId(null)}
                        className={`flex h-10 cursor-grab items-center gap-3 rounded-lg border border-white/25 bg-[#151515] px-3 text-sm font-medium text-white/90 active:cursor-grabbing ${
                          draggingStatusId === group.id ? "opacity-50" : ""
                        }`}
                      >
                        <span className="text-white/35">⠿</span>
                        <span
                          className={`size-4 rounded-full border-2 ${statusDotClass(group.tone, category)}`}
                        />
                        <span className="min-w-0 flex-1 truncate">{group.label}</span>
                        <span className="text-white/55">...</span>
                      </div>
                    ))}

                    {isAdding ? (
                      <form onSubmit={onCreateStatus} className="space-y-2">
                        <div className="relative flex h-10 items-center rounded-lg border border-white/70 bg-[#111111] p-1">
                          <button
                            type="button"
                            onClick={onToggleColorPicker}
                            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-white/10 hover:bg-white/15"
                            aria-label="Pilih warna status"
                          >
                            <span
                              className={`size-5 rounded-md ${statusColorClass(newStatusColor, "swatch")}`}
                            />
                          </button>
                          <input
                            value={newStatusName}
                            onChange={(event) => onNameChange(event.target.value)}
                            autoFocus
                            placeholder="Status name"
                            className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold text-white outline-none placeholder:text-white/35"
                          />

                          {colorPickerOpen && newStatusCategory === category ? (
                            <div className="absolute left-0 top-11 z-20 flex gap-1 rounded-lg border border-white/10 bg-[#1b1b1b] p-1.5 shadow-xl">
                              {STATUS_COLORS.map((color) => (
                                <button
                                  key={color.value}
                                  type="button"
                                  onClick={() => onColorChange(color.value)}
                                  className={`flex size-6 items-center justify-center rounded-md hover:bg-white/10 ${
                                    newStatusColor === color.value ? "bg-white/10" : ""
                                  }`}
                                  aria-label={`Warna ${color.label}`}
                                >
                                  <span
                                    className={`size-4 rounded ${statusColorClass(color.value, "swatch")}`}
                                  />
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={creatingStatus}
                            className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-white/85 disabled:opacity-60"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={onCancelAdd}
                            className="rounded-md px-3 py-1.5 text-xs font-semibold text-white/45 hover:bg-white/10 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                        {newStatusError ? (
                          <p className="text-xs text-red-300">{newStatusError}</p>
                        ) : null}
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onStartAdd(category)}
                        className="flex h-10 w-full items-center gap-3 rounded-lg border border-dashed border-white/20 px-10 text-left text-sm text-white/35 hover:border-white/35 hover:text-white/65"
                      >
                        <PlusIcon className="size-4" />
                        Add status
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
            </div>
        </div>

        <footer className="flex items-center justify-end border-t border-white/10 px-7 py-4">
          <button
            type="button"
            onClick={onApplyChanges}
            disabled={savingStatusChanges}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingStatusChanges ? "Saving..." : "Apply changes"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function TaskDetailModal({
  task,
  projectId,
  groups,
  members,
  workspaceTags,
  onCreateWorkspaceTag,
  onUpdateTask,
  onPatchTask,
  onMoveTaskToStatus,
  onClose,
}: {
  task: Task | null;
  projectId: number;
  groups: StatusGroup[];
  members: ProjectMember[];
  workspaceTags: WorkspaceTag[];
  onCreateWorkspaceTag: (name: string) => Promise<WorkspaceTag | null>;
  onUpdateTask: (
    taskId: number,
    updates: Partial<
      Pick<
        Task,
        "name" | "description" | "assigneeId" | "assigneeIds" | "assignee" | "startDate" | "dueDate" | "due" | "priority" | "tags" | "attachments"
      >
    >,
  ) => void;
  onPatchTask: (
    taskId: number,
    body: Record<string, string | number | null | string[] | number[]>,
  ) => Promise<void>;
  onMoveTaskToStatus: (task: Task, nextStatus: StatusGroup) => void;
  onClose: () => void;
}) {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [openField, setOpenField] = useState<
    "status" | "assignee" | "date" | "priority" | "tags" | null
  >(null);
  const [statusSearch, setStatusSearch] = useState("");
  const [activeDateField, setActiveDateField] = useState<"start" | "due">("due");
  const [tagInput, setTagInput] = useState("");
  const [description, setDescription] = useState(task?.description ?? "");
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [canComment, setCanComment] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [publicLink, setPublicLink] = useState<TaskPublicLink | null>(null);
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [comment, setComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [isDraggingAttachment, setIsDraggingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const activityListRef = useRef<HTMLDivElement>(null);
  const descriptionSaveTimers = useRef(
    new Map<number, ReturnType<typeof setTimeout>>(),
  );
  const selectedTags = task?.tags ?? [];
  const taskId = task?.id;

  useEffect(() => {
    const panel = detailScrollRef.current;

    if (!taskId || !panel) {
      return;
    }

    panel.scrollTop = 0;

    const handleWheel = (event: WheelEvent) => {
      if (!event.deltaY) {
        return;
      }

      event.preventDefault();
      panel.scrollTop += event.deltaY;
    };

    panel.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false,
    });

    return () => panel.removeEventListener("wheel", handleWheel, true);
  }, [mounted, taskId]);

  useEffect(() => {
    if (!mounted || !task) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted, task]);

  function applyActivitiesResponse(data: TaskActivitiesResponse | null) {
    setActivities(data?.activities ?? []);
    setCanComment(Boolean(data?.canComment));
    setCanPublish(Boolean(data?.canPublish));
    setPublicLink(data?.publicLink ?? null);
  }

  const loadActivities = useCallback(
    async (taskId: number) => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/tasks/${taskId}/activities`,
        );
        const data = response.ok
          ? ((await response.json()) as TaskActivitiesResponse)
          : null;

        applyActivitiesResponse(data);
      } catch {
        applyActivitiesResponse(null);
      } finally {
        setActivitiesLoading(false);
      }
    },
    [projectId],
  );

  async function patchTaskWithActivity(
    taskId: number,
    body: Record<string, string | number | null | string[] | number[]>,
  ) {
    await onPatchTask(taskId, body);
    await loadActivities(taskId);
  }

  async function submitComment() {
    const nextComment = comment.trim();

    if (!task || !nextComment || sendingComment) {
      return;
    }

    setSendingComment(true);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/tasks/${task.id}/activities`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: nextComment }),
        },
      );

      if (response.ok) {
        setComment("");
        await loadActivities(task.id);
      }
    } finally {
      setSendingComment(false);
    }
  }

  async function uploadAttachments(files: FileList | null) {
    if (!task || !files?.length || uploadingAttachments) {
      return;
    }

    setUploadingAttachments(true);
    setAttachmentError("");

    try {
      const formData = new FormData();

      Array.from(files).forEach((file) => formData.append("files", file));

      const response = await fetch(
        `/api/projects/${projectId}/tasks/${task.id}/attachments`,
        {
          method: "POST",
          body: formData,
        },
      );
      const data = (await response.json()) as {
        attachments?: TaskAttachment[];
        error?: string;
      };

      if (!response.ok) {
        setAttachmentError(data.error ?? "Gagal mengunggah file.");
        return;
      }

      const nextAttachments = [
        ...(task.attachments ?? []),
        ...(data.attachments ?? []),
      ];
      onUpdateTask(task.id, { attachments: nextAttachments });
      await loadActivities(task.id);
    } catch {
      setAttachmentError("Gagal terhubung ke server.");
    } finally {
      setUploadingAttachments(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  useEffect(() => {
    if (!taskId) {
      return;
    }

    const controller = new AbortController();

    fetch(`/api/projects/${projectId}/tasks/${taskId}/activities`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: TaskActivitiesResponse | null) => applyActivitiesResponse(data))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          applyActivitiesResponse(null);
        }
      })
      .finally(() => setActivitiesLoading(false));

    return () => controller.abort();
  }, [projectId, taskId]);

  useEffect(() => {
    const list = activityListRef.current;

    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [activities.length]);

  // Guests reply from the public page, so keep the open conversation fresh.
  useEffect(() => {
    if (!taskId) {
      return;
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadActivities(taskId);
      }
    }, 10_000);

    return () => window.clearInterval(interval);
  }, [loadActivities, taskId]);

  useEffect(() => {
    if (!publishMenuOpen) {
      return;
    }

    function closePublishMenuOnOutsideClick(event: PointerEvent) {
      const target = event.target as HTMLElement | null;

      if (!target?.closest("[data-publish-menu]")) {
        setPublishMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closePublishMenuOnOutsideClick, true);

    return () => {
      document.removeEventListener(
        "pointerdown",
        closePublishMenuOnOutsideClick,
        true,
      );
    };
  }, [publishMenuOpen]);

  function saveDescription(taskId: number, nextDescription: string) {
    const currentTimer = descriptionSaveTimers.current.get(taskId);

    if (currentTimer) {
      clearTimeout(currentTimer);
      descriptionSaveTimers.current.delete(taskId);
    }

    onUpdateTask(taskId, { description: nextDescription });
    void patchTaskWithActivity(taskId, { description: nextDescription });
  }

  async function copyPublicLink() {
    if (!publicLink) {
      return;
    }

    const absoluteUrl = new URL(publicLink.url, window.location.origin).toString();
    await navigator.clipboard.writeText(absoluteUrl);
    setPublicLinkCopied(true);
    window.setTimeout(() => setPublicLinkCopied(false), 1600);
  }

  async function setTaskPublished(published: boolean) {
    if (!task || publishBusy) {
      return;
    }

    setPublishBusy(true);
    setPublishError("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/tasks/${task.id}/publish`,
        { method: published ? "POST" : "DELETE" },
      );
      const data = (await response.json().catch(() => ({}))) as {
        publicLink?: TaskPublicLink | null;
        error?: string;
      };

      if (!response.ok) {
        setPublishError(data.error ?? "Gagal mengubah publikasi task.");
        return;
      }

      setPublicLink(data.publicLink ?? null);
      await loadActivities(task.id);
    } catch {
      setPublishError("Gagal terhubung ke server.");
    } finally {
      setPublishBusy(false);
    }
  }

  function queueDescriptionSave(nextDescription: string) {
    setDescription(nextDescription);

    if (!task) {
      return;
    }

    const taskId = task.id;
    const currentTimer = descriptionSaveTimers.current.get(taskId);

    if (currentTimer) {
      clearTimeout(currentTimer);
    }

    descriptionSaveTimers.current.set(
      taskId,
      setTimeout(() => {
        descriptionSaveTimers.current.delete(taskId);
        onUpdateTask(taskId, { description: nextDescription });
        void patchTaskWithActivity(taskId, { description: nextDescription });
      }, 600),
    );
  }

  function saveTaskName(value: string, field: HTMLTextAreaElement) {
    const nextName = value.trim();

    if (!task || !nextName || nextName === task.name) {
      field.value = task?.name ?? "";
      return;
    }

    onUpdateTask(task.id, { name: nextName });
    void patchTaskWithActivity(task.id, { name: nextName });
  }

  useEffect(() => {
    if (!task) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }

        if (openField) {
          setOpenField(null);
          return;
        }

        onClose();
      }
    }

    window.addEventListener("keydown", closeOnEscape, true);

    return () => {
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [onClose, openField, task]);

  useEffect(() => {
    if (!task || !openField) {
      return;
    }

    function closeDetailFieldOnOutsideClick(event: PointerEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.closest("[data-floating-popover]")) {
        return;
      }

      setOpenField(null);
    }

    document.addEventListener(
      "pointerdown",
      closeDetailFieldOnOutsideClick,
      true,
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        closeDetailFieldOnOutsideClick,
        true,
      );
    };
  }, [openField, task]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-3 transition-opacity duration-200 ${
        task ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      onPointerDown={onClose}
      aria-hidden={!task}
    >
      <section
        role="dialog"
        aria-modal="true"
        onPointerDown={(event) => event.stopPropagation()}
        className={`grid h-[90dvh] w-[96vw] max-w-[1800px] grid-rows-[3rem_minmax(0,1fr)] overflow-hidden rounded-lg border border-white/10 bg-[#111] text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)] transition-all duration-200 ${
          task ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.98] opacity-0"
        }`}
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-5">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white/70">
            <span className="rounded bg-[#4f46e5] px-1.5 py-0.5 text-[11px] text-white">
              T
            </span>
            <span className="truncate">Team Space</span>
            <span className="text-white/30">/</span>
            <span className="truncate text-white">{task?.name ?? "Task"}</span>
          </div>
          <div className="flex items-center gap-4">
            {task ? (
              <div data-publish-menu className="relative">
                <button
                  type="button"
                  onClick={() => setPublishMenuOpen((open) => !open)}
                  aria-expanded={publishMenuOpen}
                  className={`inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-xs font-semibold transition focus:outline-none ${
                    publicLink
                      ? "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                      : "border-white/10 text-white/65 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <GlobeAltIcon className="size-3.5" />
                  {publicLink ? "Published" : "Publish"}
                </button>
                {publishMenuOpen ? (
                  <div className="absolute right-0 top-full z-50 mt-2 w-[360px] rounded-lg border border-white/10 bg-[#1c1c1c] p-4 text-left shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
                    <p className="text-sm font-semibold text-white">
                      {publicLink
                        ? publicLink.kind === "data_request"
                          ? "Link monitoring pemohon"
                          : "Task ini sudah publik"
                        : "Publish task ini"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-white/50">
                      Siapa pun yang punya link bisa melihat judul, status,
                      tanggal, deskripsi, dan percakapan task ini, lalu ikut
                      mengirim pesan tanpa login.
                    </p>
                    {publicLink ? (
                      <>
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            readOnly
                            value={new URL(publicLink.url, window.location.origin).toString()}
                            onFocus={(event) => event.currentTarget.select()}
                            className="h-8 min-w-0 flex-1 rounded border border-white/10 bg-[#151515] px-2 text-xs text-white/70 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void copyPublicLink()}
                            className="form-save-button inline-flex h-8 shrink-0 items-center gap-1.5 rounded bg-white px-3 text-xs font-semibold text-black transition hover:bg-white/85"
                          >
                            <LinkIcon className="size-3.5" />
                            {publicLinkCopied ? "Tersalin" : "Salin"}
                          </button>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <a
                            href={publicLink.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-semibold text-[#7d96ff] hover:underline"
                          >
                            Buka halaman publik
                          </a>
                          {publicLink.kind === "shared" && canPublish ? (
                            <button
                              type="button"
                              onClick={() => void setTaskPublished(false)}
                              disabled={publishBusy}
                              className="text-xs font-semibold text-red-400 transition hover:text-red-300 disabled:opacity-50"
                            >
                              {publishBusy ? "Menghentikan..." : "Stop publish"}
                            </button>
                          ) : null}
                        </div>
                        {publicLink.kind === "data_request" ? (
                          <p className="mt-3 text-[11px] leading-4 text-white/35">
                            Link ini dibuat otomatis dari import Permintaan Data.
                          </p>
                        ) : null}
                      </>
                    ) : canPublish ? (
                      <button
                        type="button"
                        onClick={() => void setTaskPublished(true)}
                        disabled={publishBusy}
                        className="form-save-button mt-3 h-8 w-full rounded bg-white text-xs font-semibold text-black transition hover:bg-white/85 disabled:cursor-wait disabled:opacity-60"
                      >
                        {publishBusy ? "Membuat link..." : "Publish & buat link"}
                      </button>
                    ) : (
                      <p className="mt-3 text-xs text-white/40">
                        Hanya pengelola project yang bisa publish task.
                      </p>
                    )}
                    {publishError ? (
                      <p className="mt-2 text-[11px] text-red-400">{publishError}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <span className="text-xs font-semibold text-white/35">Created Jul 7</span>
            <button
              type="button"
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-full bg-white/10 text-white/60 transition hover:bg-white/15 hover:text-white"
              aria-label="Close task detail"
            >
              <XMarkIcon className="size-4" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(460px,34%)] overflow-hidden">
          <div className="min-h-0 min-w-0 overflow-hidden">
            <div
              ref={detailScrollRef}
              className="h-full min-h-0 touch-pan-y overflow-y-scroll overscroll-contain px-12 pb-32 pt-8 [scrollbar-gutter:stable]"
            >
            <p className="mb-5 inline-flex rounded-md border border-white/10 px-2 py-1 text-xs font-semibold text-white/60">
              Task
            </p>
            <textarea
              key={task?.id ?? "task-name"}
              defaultValue={task?.name ?? ""}
              onBlur={(event) => saveTaskName(event.currentTarget.value, event.currentTarget)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              rows={2}
              aria-label="Task name"
              className="mb-7 block w-full max-w-[59ch] resize-none break-words rounded-md border border-transparent bg-transparent p-0 text-2xl font-semibold leading-snug text-white outline-none transition placeholder:text-white/35 hover:border-white/10 hover:bg-white/5 focus:border-white/20 focus:bg-white/5"
              placeholder="Task name"
            />

            <div className="grid max-w-3xl grid-cols-[150px_1fr_140px_1fr] gap-x-8 gap-y-4 text-sm">
              <span className="text-white/35">Status</span>
              <span className="relative" data-floating-popover>
                <button
                  type="button"
                  onClick={() =>
                    setOpenField((field) => (field === "status" ? null : "status"))
                  }
                  className="rounded-md transition hover:ring-1 hover:ring-white/20"
                >
                  {task ? <StatusBadge task={task} /> : null}
                </button>
                {openField === "status" && task ? (
                  <StatusPickerPopover
                    groups={groups}
                    currentStatus={task.status}
                    search={statusSearch}
                    onSearchChange={setStatusSearch}
                    onSelect={(nextStatus) => {
                      onMoveTaskToStatus(task, nextStatus);
                      void patchTaskWithActivity(task.id, {
                        statusId: nextStatus.id,
                      });
                      setOpenField(null);
                    }}
                  />
                ) : null}
              </span>
              <span className="text-white/35">Assignees</span>
              <span className="relative" data-floating-popover>
                <button
                  type="button"
                  onClick={() =>
                    setOpenField((field) =>
                      field === "assignee" ? null : "assignee",
                    )
                  }
                  className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-white/75 transition hover:bg-white/10"
                >
                  <AssigneeAvatars assignee={task?.assignee ?? ""} />
                  {task?.assignee ? null : <span>Empty</span>}
                </button>
                {openField === "assignee" && task ? (
                  <div data-floating-popover className="absolute left-0 top-9 z-40 w-56 rounded-lg border border-white/10 bg-[#202020] p-1 shadow-xl">
                    {members.length ? (
                      members.map((member) => {
                        const selectedAssigneeIds = getTaskAssigneeIds(task);
                        const isSelected = selectedAssigneeIds.includes(member.id);

                        return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => {
                            const nextAssigneeIds = isSelected
                              ? selectedAssigneeIds.filter((id) => id !== member.id)
                              : [...selectedAssigneeIds, member.id];

                            onUpdateTask(task.id, {
                              assigneeId: nextAssigneeIds[0] ?? null,
                              assigneeIds: nextAssigneeIds,
                              assignee: getAssigneeInitials(nextAssigneeIds, members),
                            });
                            void patchTaskWithActivity(task.id, {
                              assigneeIds: nextAssigneeIds,
                            });
                          }}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold hover:bg-white/10 ${
                            isSelected ? "bg-white/10 text-white" : "text-white/75"
                          }`}
                        >
                          <span className="flex size-5 items-center justify-center rounded-full bg-white text-[10px] text-black">
                            {getInitials(member.name)}
                          </span>
                          <span className="truncate">{member.name}</span>
                          <span className={`ml-auto size-2 rounded-full ${isSelected ? "bg-violet-500" : "bg-transparent"}`} />
                        </button>
                        );
                      })
                    ) : (
                      <p className="px-2 py-1.5 text-xs text-white/40">
                        Belum ada member
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateTask(task.id, { assigneeId: null, assigneeIds: [], assignee: "" });
                        void patchTaskWithActivity(task.id, {
                          assigneeIds: [],
                        });
                        setOpenField(null);
                      }}
                      className="mt-1 flex w-full border-t border-white/10 px-2 py-1.5 text-left text-xs font-semibold text-white/50 hover:bg-white/10"
                    >
                      Clear
                    </button>
                  </div>
                ) : null}
              </span>

              <span className="text-white/35">Dates</span>
              <span className="relative" data-floating-popover>
                <button
                  type="button"
                  onClick={() =>
                    setOpenField((field) => (field === "date" ? null : "date"))
                  }
                  className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-white/75 transition hover:bg-white/10"
                >
                  <CalendarDaysIcon className="size-4 text-white/40" />
                  {task?.startDate && task.dueDate
                    ? `${formatNumericDate(task.startDate)} - ${formatNumericDate(task.dueDate)}`
                    : task?.dueDate
                      ? formatNumericDate(task.dueDate)
                      : task?.startDate
                        ? formatNumericDate(task.startDate)
                        : "Empty"}
                </button>
                {openField === "date" && task ? (
                  <DatePickerPopover
                    startDate={task.startDate ?? ""}
                    dueDate={task.dueDate ?? ""}
                    activeField={activeDateField}
                    onActiveFieldChange={setActiveDateField}
                    onSelect={(date) => {
                      if (activeDateField === "start") {
                        if (
                          task.dueDate &&
                          new Date(`${date}T00:00:00`).getTime() >
                            new Date(`${task.dueDate}T00:00:00`).getTime()
                        ) {
                          onUpdateTask(task.id, {
                            startDate: "",
                            due: formatNumericDate(date),
                            dueDate: date,
                          });
                          void patchTaskWithActivity(task.id, {
                            startDate: "",
                            dueDate: date,
                          });
                          setActiveDateField("due");
                          return;
                        }

                        onUpdateTask(task.id, { startDate: date });
                        void patchTaskWithActivity(task.id, { startDate: date });

                        if (!task.dueDate) {
                          setActiveDateField("due");
                        }
                        return;
                      }

                      const clearsStartDate = Boolean(
                        task.startDate &&
                          new Date(`${date}T00:00:00`).getTime() <
                            new Date(`${task.startDate}T00:00:00`).getTime(),
                      );
                      onUpdateTask(task.id, {
                        startDate: clearsStartDate ? "" : task.startDate,
                        due: formatNumericDate(date),
                        dueDate: date,
                      });
                      void patchTaskWithActivity(task.id, {
                        ...(clearsStartDate ? { startDate: "" } : {}),
                        dueDate: date,
                      });
                    }}
                    onClear={(field) => {
                      if (field === "start") {
                        onUpdateTask(task.id, { startDate: "" });
                        void patchTaskWithActivity(task.id, { startDate: "" });
                        return;
                      }

                      onUpdateTask(task.id, { due: "", dueDate: "" });
                      void patchTaskWithActivity(task.id, { dueDate: "" });
                    }}
                  />
                ) : null}
              </span>
              <span className="text-white/35">Priority</span>
              <span className="relative" data-floating-popover>
                <button
                  type="button"
                  onClick={() =>
                    setOpenField((field) =>
                      field === "priority" ? null : "priority",
                    )
                  }
                  className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-white/75 transition hover:bg-white/10"
                >
                  <span className={priorityColorClass(task?.priority ?? "")}>⚑</span>
                  <span className={priorityColorClass(task?.priority ?? "")}>
                    {task?.priority || "Empty"}
                  </span>
                </button>
                {openField === "priority" && task ? (
                  <PriorityPopover
                    onSelect={(priority) => {
                      onUpdateTask(task.id, { priority });
                      void patchTaskWithActivity(task.id, { priority });
                      setOpenField(null);
                    }}
                  />
                ) : null}
              </span>

              <span className="text-white/35">Tags</span>
              <span className="relative" data-floating-popover>
                <button
                  type="button"
                  onClick={() =>
                    setOpenField((field) => (field === "tags" ? null : "tags"))
                  }
                  className="min-h-8 w-full rounded-md bg-white/5 px-3 py-1.5 text-left text-white/35 transition hover:bg-white/10"
                >
                  {selectedTags.length ? selectedTags.join(", ") : "Empty"}
                </button>
                {openField === "tags" ? (
                  <TagPopover
                    value={tagInput}
                    options={workspaceTags}
                    onChange={setTagInput}
                    onSelect={(tagName) => {
                      const nextTags = selectedTags.includes(tagName)
                        ? selectedTags
                        : [...selectedTags, tagName];

                      if (task) {
                        onUpdateTask(task.id, { tags: nextTags });
                        void patchTaskWithActivity(task.id, { tags: nextTags });
                      }
                      setTagInput("");
                      setOpenField(null);
                    }}
                    onCreate={() => {
                      if (tagInput.trim()) {
                        void onCreateWorkspaceTag(tagInput).then((tag) => {
                          if (!tag) {
                            return;
                          }

                          const nextTags = selectedTags.includes(tag.name)
                            ? selectedTags
                            : [...selectedTags, tag.name];

                          if (task) {
                            onUpdateTask(task.id, { tags: nextTags });
                            void patchTaskWithActivity(task.id, {
                              tags: nextTags,
                            });
                          }
                          setTagInput("");
                          setOpenField(null);
                        });
                      }
                    }}
                  />
                ) : null}
              </span>
            </div>

            <div className="mt-8 border-t border-white/10 pt-5">
              <TiptapDescription
                id={`task-detail-description-${task?.id ?? "empty"}`}
                value={description}
                onChange={queueDescriptionSave}
                onBlur={() => {
                  if (task) {
                    saveDescription(task.id, description);
                  }
                }}
                placeholder="Add description, notes, checklist, or supporting details for this task."
                minHeight={110}
              />
            </div>

            <div className="mt-10 space-y-4 text-sm text-white/70">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => void uploadAttachments(event.target.files)}
              />
              <button
                type="button"
                disabled={uploadingAttachments}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 transition hover:text-white disabled:opacity-50"
              >
                <PaperClipIcon className="size-4" />
                {uploadingAttachments ? "Uploading..." : "Attach file"}
              </button>
              {attachmentError ? (
                <p className="text-xs text-red-400">{attachmentError}</p>
              ) : null}
              {task?.attachments?.length ? (
                <div className="space-y-3">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setIsDraggingAttachment(true);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                      setIsDraggingAttachment(true);
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                        setIsDraggingAttachment(false);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setIsDraggingAttachment(false);
                      void uploadAttachments(event.dataTransfer.files);
                    }}
                    className={`flex h-14 cursor-pointer items-center justify-center rounded-md border border-dashed text-sm transition ${
                      isDraggingAttachment
                        ? "border-blue-400 bg-blue-500/10 text-white"
                        : "border-white/20 text-white/55 hover:border-white/35 hover:text-white/75"
                    }`}
                  >
                    {uploadingAttachments ? (
                      "Uploading..."
                    ) : (
                      <span>
                        Drop files here or{" "}
                        <span className="underline decoration-dotted underline-offset-4">
                          browse
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                    {task.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 overflow-hidden rounded-md border border-white/10 bg-white/[0.03] transition hover:bg-white/[0.06]"
                      >
                        <div
                          className="flex h-20 items-center justify-center bg-[#151515] bg-cover bg-center"
                          style={
                            attachment.type.startsWith("image/")
                              ? { backgroundImage: `url(${attachment.url})` }
                              : undefined
                          }
                        >
                          {!attachment.type.startsWith("image/") ? (
                            <PaperClipIcon className="size-7 text-white/35" />
                          ) : null}
                        </div>
                        <div className="px-2 py-1.5">
                          <p className="truncate text-xs font-medium text-white/75">
                            {attachment.name}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            </div>
          </div>

          <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-white/10 bg-[#0d0d0d]">
            <header className="flex h-12 items-center justify-between border-b border-white/10 px-4">
              <h3 className="text-sm font-semibold text-white/80">Activity</h3>
              <MagnifyingGlassIcon className="size-4 text-white/45" />
            </header>
            <div
              ref={activityListRef}
              className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
            >
              {activitiesLoading && !activities.length ? (
                <p className="text-xs text-white/35">Loading activity...</p>
              ) : null}
              {!activitiesLoading && !activities.length ? (
                <p className="text-xs text-white/35">No activity yet.</p>
              ) : null}
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex gap-2.5 text-xs">
                    <ActivityDot activity={activity} />
                    <div className="min-w-0 flex-1">
                      {activity.type === "created" ? (
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 text-white/50">
                            <span className="font-semibold text-white/70">
                              {activity.actor}
                            </span>{" "}
                            created this task
                          </p>
                          <p className="shrink-0 text-white/35">
                            {formatActivityTimestamp(activity.createdAt)}
                          </p>
                        </div>
                      ) : activity.type === "comment" ? (
                        <div
                          className={`rounded-md px-2.5 py-2 text-white/75 ${
                            activity.isGuest
                              ? "border border-emerald-500/25 bg-emerald-500/[0.06]"
                              : "bg-white/5"
                          }`}
                        >
                          <p className="mb-1 flex items-center gap-1.5 font-semibold text-white/85">
                            {activity.actor}
                            {activity.isGuest ? (
                              <span className="rounded bg-emerald-500/15 px-1.5 py-px text-[10px] font-semibold text-emerald-400">
                                Guest
                              </span>
                            ) : null}
                          </p>
                          <p className="break-words leading-relaxed">
                            {activity.message}
                          </p>
                        </div>
                      ) : activity.type === "attachment" && activity.attachment ? (
                        <div>
                          <p className="text-white/50">
                            <span className="font-semibold text-white/70">
                              {activity.actor}
                            </span>{" "}
                            uploaded a file
                          </p>
                          <p className="mt-1 text-[10px] text-white/25">
                            {formatActivityTimestamp(activity.createdAt)}
                          </p>
                          <a
                            href={activity.attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block w-44 overflow-hidden rounded-md border border-white/10 bg-white/[0.03] transition hover:bg-white/[0.06]"
                          >
                            <div
                              className="flex h-24 items-center justify-center bg-[#151515] bg-cover bg-center"
                              style={
                                activity.attachment.type.startsWith("image/")
                                  ? {
                                      backgroundImage: `url(${activity.attachment.url})`,
                                    }
                                  : undefined
                              }
                            >
                              {!activity.attachment.type.startsWith("image/") ? (
                                <PaperClipIcon className="size-8 text-white/35" />
                              ) : null}
                            </div>
                            <p className="truncate px-2 py-2 text-xs text-white/75">
                              {activity.attachment.name}
                            </p>
                          </a>
                        </div>
                      ) : (
                        <p className="break-words leading-relaxed text-white/55">
                          <span className="font-semibold text-white/75">
                            {activity.actor}
                          </span>{" "}
                          {activity.message}
                        </p>
                      )}
                      {activity.type !== "created" && activity.type !== "attachment" ? (
                        <p className="mt-1 text-[10px] text-white/25">
                          {formatActivityTimestamp(activity.createdAt)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {canComment ? (
              <div className="border-t border-white/10 p-4">
                {publicLink ? (
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] text-emerald-400/80">
                    <GlobeAltIcon className="size-3.5" />
                    Komentar juga terlihat di halaman publik task ini.
                  </p>
                ) : null}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAttachments}
                    aria-label="Attach file to comment"
                    title="Attach file"
                    className="absolute left-2 top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-40"
                  >
                    <PlusIcon className="size-4" />
                  </button>
                  <input
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void submitComment();
                      }
                    }}
                    disabled={sendingComment}
                    placeholder={
                      uploadingAttachments ? "Uploading attachment..." : "Write a comment..."
                    }
                    className="h-11 w-full rounded-lg border border-white/10 bg-[#151515] py-2 pl-11 pr-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/30 disabled:opacity-50"
                  />
                </div>
                {attachmentError ? (
                  <p className="mt-1.5 text-[11px] text-red-400">
                    {attachmentError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function BoardView({
  groups,
  setGroups,
  projectId,
  workspaceId,
  onAddTask,
  canManageProject,
}: {
  groups: StatusGroup[];
  setGroups: Dispatch<SetStateAction<StatusGroup[]>>;
  projectId: number;
  workspaceId: number;
  onAddTask: () => void;
  canManageProject: boolean;
}) {
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const [dropTargetStatusId, setDropTargetStatusId] = useState<number | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [workspaceTags, setWorkspaceTags] = useState<WorkspaceTag[]>([]);
  const detailTask =
    groups.flatMap((group) => group.tasks).find((task) => task.id === detailTaskId) ??
    null;

  useEffect(() => {
    fetch(`/api/projects/${projectId}/members`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { members?: ProjectMember[] } | null) => {
        setMembers(data?.members ?? []);
      })
      .catch(() => setMembers([]));
  }, [projectId]);

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/tags`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { tags?: WorkspaceTag[] } | null) => {
        setWorkspaceTags(data?.tags ?? []);
      })
      .catch(() => setWorkspaceTags([]));
  }, [workspaceId]);

  async function createWorkspaceTag(name: string) {
    const tagName = name.trim();
    const existingTag = workspaceTags.find(
      (tag) => tag.name.toLowerCase() === tagName.toLowerCase(),
    );

    if (!tagName) {
      return null;
    }

    if (existingTag) {
      return existingTag;
    }

    const response = await fetch(`/api/workspaces/${workspaceId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tagName }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { tag?: WorkspaceTag };

    if (!data.tag) {
      return null;
    }

    setWorkspaceTags((currentTags) => [...currentTags, data.tag!]);
    return data.tag;
  }

  function updateTaskFields(
    taskId: number,
    updates: Partial<
      Pick<
        Task,
        "name" | "description" | "assigneeId" | "assigneeIds" | "assignee" | "startDate" | "dueDate" | "due" | "priority" | "tags" | "attachments"
      >
    >,
  ) {
    setGroups((currentGroups) =>
      currentGroups.map((group) => ({
        ...group,
        tasks: group.tasks.map((task) =>
          task.id === taskId ? { ...task, ...updates } : task,
        ),
      })),
    );
  }

  async function patchTask(
    taskId: number,
    body: Record<string, string | number | null | string[] | number[]>,
  ) {
    await fetch(`/api/projects/${projectId}/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, ...body }),
    });
  }

  function moveTaskToStatus(task: Task, nextStatus: StatusGroup) {
    setGroups((currentGroups) =>
      currentGroups.map((group) => {
        if (group.id === nextStatus.id) {
          return {
            ...group,
            tasks: [
              ...group.tasks.filter((groupTask) => groupTask.id !== task.id),
              {
                ...task,
                status: nextStatus.label,
                tone: nextStatus.tone,
              },
            ],
          };
        }

        return {
          ...group,
          tasks: group.tasks.filter((groupTask) => groupTask.id !== task.id),
        };
      }),
    );
  }

  async function dropTaskOnStatus(taskId: number, nextStatus: StatusGroup) {
    if (!taskId) {
      return;
    }

    const sourceStatus = groups.find((group) =>
      group.tasks.some((task) => task.id === taskId),
    );
    const task = sourceStatus?.tasks.find((item) => item.id === taskId);

    setDropTargetStatusId(null);
    setDraggingTaskId(null);

    if (!sourceStatus || !task || sourceStatus.id === nextStatus.id) {
      return;
    }

    moveTaskToStatus(task, nextStatus);

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          statusId: nextStatus.id,
        }),
      });

      if (!response.ok) {
        moveTaskToStatus(task, sourceStatus);
      }
    } catch {
      moveTaskToStatus(task, sourceStatus);
    }
  }

  return (
    <>
    <main className="flex-1 overflow-x-auto px-4 py-5">
      <div className="flex w-max min-w-full items-start gap-3">
        {groups.map((group) => (
          <section
            key={group.label}
            onDragEnter={(event) => {
              if (!draggingTaskId) {
                return;
              }

              event.preventDefault();
              setDropTargetStatusId(group.id);
            }}
            onDragOver={(event) => {
              if (!draggingTaskId) {
                return;
              }

              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropTargetStatusId(group.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const taskId =
                Number(event.dataTransfer.getData("text/plain")) ||
                draggingTaskId ||
                0;
              void dropTaskOnStatus(taskId, group);
            }}
            className={`min-h-[112px] w-[270px] shrink-0 rounded-xl border p-2.5 transition-colors ${
              dropTargetStatusId === group.id
                ? "border-[#5b7cff]/70 bg-[#171c29]"
                : "border-transparent bg-[#12151d]"
            }`}
          >
            <p className="mb-1 text-[10px] font-semibold uppercase text-white/30">
              {STATUS_CATEGORY_LABELS[group.category]}
            </p>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${statusColorClass(group.tone, "badge")}`}>
                <span className="size-3.5 rounded-full border-2 border-white" />
                {group.label}
              </div>
              <span className="text-sm font-semibold text-[#5b7cff]">
                {group.tasks.length}
              </span>
            </div>
            <div className="mt-2 space-y-2">
              {group.tasks.map((task) => (
                <button
                  type="button"
                  key={task.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", String(task.id));
                    setDraggingTaskId(task.id);
                    setDropTargetStatusId(group.id);
                  }}
                  onDragEnd={() => {
                    setDraggingTaskId(null);
                    setDropTargetStatusId(null);
                  }}
                  onClick={() => setDetailTaskId(task.id)}
                  className={`block w-full cursor-grab overflow-hidden rounded-lg border border-white/10 bg-[#1c1c1c] text-left transition hover:border-white/20 hover:bg-[#202020] active:cursor-grabbing ${
                    draggingTaskId === task.id ? "scale-[0.98] opacity-35" : ""
                  }`}
                >
                  <BoardAttachments attachments={task.attachments ?? []} />
                  <div className="p-3">
                    <h3 className="line-clamp-2 min-h-5 break-words text-sm font-semibold leading-5 text-white/85">
                      {task.name}
                    </h3>
                    {task.attachments?.length ? (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-white/40">
                        <PaperClipIcon className="size-3.5" />
                        <span>{task.attachments.length}</span>
                      </div>
                    ) : null}
                    <div className="mt-3 flex min-h-7 flex-wrap items-center gap-2">
                      <BoardAssigneeAvatars assignee={task.assignee} />
                      <span
                        className={`inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md border border-white/10 px-1.5 text-xs ${
                          task.due ? "text-emerald-400" : "text-white/40"
                        }`}
                      >
                        <CalendarDaysIcon className="size-3.5 text-white/45" />
                        {task.due ? <span>{task.due}</span> : null}
                      </span>
                      <span className="inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md border border-white/10 px-1.5 text-xs text-white/40">
                        <FlagIcon className={`size-3.5 ${priorityColorClass(task.priority)}`} />
                        {task.priority ? (
                          <span className={priorityColorClass(task.priority)}>{task.priority}</span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
              {canManageProject ? <button
                type="button"
                onClick={onAddTask}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-[#5b7cff] transition hover:bg-[#5b7cff]/10 hover:text-[#7d96ff]"
              >
                <PlusIcon className="size-3.5" />
                Add Task
              </button> : null}
            </div>
          </section>
        ))}
      </div>
    </main>
      <TaskDetailModal
        key={detailTask?.id ?? "empty-board-task-detail"}
        task={detailTask}
        groups={groups}
        members={members}
        workspaceTags={workspaceTags}
        projectId={projectId}
        onCreateWorkspaceTag={createWorkspaceTag}
        onUpdateTask={updateTaskFields}
        onPatchTask={patchTask}
        onMoveTaskToStatus={moveTaskToStatus}
        onClose={() => setDetailTaskId(null)}
      />
    </>
  );
}

function BoardAttachments({ attachments }: { attachments: TaskAttachment[] }) {
  if (!attachments.length) {
    return null;
  }

  const newestAttachments = [...attachments].sort((first, second) => {
    const dateDifference =
      new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();

    return dateDifference || second.id - first.id;
  });
  const latestAttachment = newestAttachments[0];

  return (
    <div
      className="min-w-0 overflow-hidden bg-[#151515]"
      title={latestAttachment.name}
    >
      <div
        className="flex aspect-[16/9] items-center justify-center bg-cover bg-center"
        style={
          latestAttachment.type.startsWith("image/")
            ? { backgroundImage: `url(${latestAttachment.url})` }
            : undefined
        }
      >
        {!latestAttachment.type.startsWith("image/") ? (
          <PaperClipIcon className="size-7 text-white/35" />
        ) : null}
      </div>
      {!latestAttachment.type.startsWith("image/") ? (
        <p className="truncate border-t border-white/10 px-2 py-1.5 text-[10px] text-white/55">
          {latestAttachment.name}
        </p>
      ) : null}
    </div>
  );
}

function BoardAssigneeAvatars({ assignee }: { assignee: string }) {
  const assignees = getAssigneeBadges(assignee);

  if (!assignees.length) {
    return (
      <span className="flex size-7 items-center justify-center rounded-md border border-white/10 text-white/40">
        <UserCircleIcon className="size-4" />
      </span>
    );
  }

  const visibleAssignees = assignees.slice(0, 5);
  const remainingCount = assignees.length - visibleAssignees.length;

  return (
    <span className="flex items-center -space-x-1.5">
      {visibleAssignees.map((value, index) => (
        <span
          key={`${value}-${index}`}
          style={{ zIndex: visibleAssignees.length - index }}
          className={`flex size-7 items-center justify-center rounded-full border border-[#1c1c1c] text-[10px] font-semibold text-white ${
            index % 2 === 0 ? "bg-pink-500" : "bg-white/20"
          }`}
        >
          {value}
        </span>
      ))}
      {remainingCount > 0 ? (
        <span className="relative z-0 flex size-7 items-center justify-center rounded-full border border-[#1c1c1c] bg-white/10 text-[10px] font-semibold text-white/70">
          +{remainingCount}
        </span>
      ) : null}
    </span>
  );
}

type TimelineScale = "month" | "week";

type TimelineTask = {
  task: Task;
  start: Date;
  end: Date;
};

type TaskDetailUpdates = Partial<
  Pick<
    Task,
    "name" | "description" | "assigneeId" | "assigneeIds" | "assignee" | "startDate" | "dueDate" | "due" | "priority" | "tags" | "attachments"
  >
>;

const TIMELINE_SIDEBAR_WIDTH = 280;
const TIMELINE_HEADER_HEIGHT = 60;
const TIMELINE_GROUP_HEIGHT = 36;
const TIMELINE_ROW_HEIGHT = 40;
const TIMELINE_UNSCHEDULED_GROUP_ID = -1;

function parseTimelineDate(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfTimelineWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  return result;
}

function timelineDayDifference(first: Date, second: Date) {
  const firstTime = Date.UTC(first.getFullYear(), first.getMonth(), first.getDate());
  const secondTime = Date.UTC(second.getFullYear(), second.getMonth(), second.getDate());
  return Math.round((firstTime - secondTime) / 86_400_000);
}

function sameTimelineDate(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

// Intl formatRange spacing differs between Node and browsers, which breaks hydration.
function formatTimelineRange(start: Date, end: Date) {
  const startLabel = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(start);

  if (sameTimelineDate(start, end)) {
    return startLabel;
  }

  return start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()
    ? `${startLabel} – ${end.getDate()}`
    : `${startLabel} – ${new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
      }).format(end)}`;
}

function useTaskDetailActions(
  projectId: number,
  workspaceId: number,
  setGroups: Dispatch<SetStateAction<StatusGroup[]>>,
) {
  const [workspaceTags, setWorkspaceTags] = useState<WorkspaceTag[]>([]);

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/tags`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { tags?: WorkspaceTag[] } | null) => {
        setWorkspaceTags(data?.tags ?? []);
      })
      .catch(() => setWorkspaceTags([]));
  }, [workspaceId]);

  async function createWorkspaceTag(name: string) {
    const tagName = name.trim();
    const existingTag = workspaceTags.find(
      (tag) => tag.name.toLowerCase() === tagName.toLowerCase(),
    );

    if (!tagName) {
      return null;
    }

    if (existingTag) {
      return existingTag;
    }

    const response = await fetch(`/api/workspaces/${workspaceId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tagName }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { tag?: WorkspaceTag };

    if (!data.tag) {
      return null;
    }

    setWorkspaceTags((currentTags) => [...currentTags, data.tag!]);
    return data.tag;
  }

  function updateTaskFields(taskId: number, updates: TaskDetailUpdates) {
    setGroups((currentGroups) =>
      currentGroups.map((group) => ({
        ...group,
        tasks: group.tasks.map((task) =>
          task.id === taskId ? { ...task, ...updates } : task,
        ),
      })),
    );
  }

  async function patchTask(
    taskId: number,
    body: Record<string, string | number | null | string[] | number[]>,
  ) {
    await fetch(`/api/projects/${projectId}/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, ...body }),
    });
  }

  function moveTaskToStatus(task: Task, nextStatus: StatusGroup) {
    setGroups((currentGroups) =>
      currentGroups.map((group) => {
        if (group.id === nextStatus.id) {
          return {
            ...group,
            tasks: [
              ...group.tasks.filter((groupTask) => groupTask.id !== task.id),
              {
                ...task,
                status: nextStatus.label,
                tone: nextStatus.tone,
              },
            ],
          };
        }

        return {
          ...group,
          tasks: group.tasks.filter((groupTask) => groupTask.id !== task.id),
        };
      }),
    );
  }

  return {
    workspaceTags,
    createWorkspaceTag,
    updateTaskFields,
    patchTask,
    moveTaskToStatus,
  };
}

function TimelineView({
  groups,
  setGroups,
  projectId,
  workspaceId,
  members,
}: {
  groups: StatusGroup[];
  setGroups: Dispatch<SetStateAction<StatusGroup[]>>;
  projectId: number;
  workspaceId: number;
  members: ProjectMember[];
}) {
  const [scale, setScale] = useState<TimelineScale>("month");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [isPanning, setIsPanning] = useState(false);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<number[]>([
    TIMELINE_UNSCHEDULED_GROUP_ID,
  ]);
  const [detailTaskId, setDetailTaskId] = useState<number | null>(null);
  const [todayScrollRequest, setTodayScrollRequest] = useState(0);
  const timelineScrollerRef = useRef<HTMLDivElement>(null);
  const scrollTargetRef = useRef<"today" | "start">("today");
  const timelinePanRef = useRef({
    active: false,
    pointerId: 0,
    startX: 0,
    startScrollLeft: 0,
  });
  const {
    workspaceTags,
    createWorkspaceTag,
    updateTaskFields,
    patchTask,
    moveTaskToStatus,
  } = useTaskDetailActions(projectId, workspaceId, setGroups);
  const detailTask =
    groups.flatMap((group) => group.tasks).find((task) => task.id === detailTaskId) ??
    null;
  const today = new Date();
  const rangeStart =
    scale === "month"
      ? new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
      : startOfTimelineWeek(anchorDate);
  const rangeEnd =
    scale === "month"
      ? new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 6, 0)
      : addDays(rangeStart, 83);
  const rangeStartTime = rangeStart.getTime();
  const dayCount = timelineDayDifference(rangeEnd, rangeStart) + 1;
  const days = Array.from({ length: dayCount }, (_, index) =>
    addDays(rangeStart, index),
  );
  const dayWidth = scale === "month" ? 44 : 128;
  const timelineWidth = dayCount * dayWidth;
  const todayIndex = timelineDayDifference(today, rangeStart);
  const todayInRange = todayIndex >= 0 && todayIndex < dayCount;
  const monthSegments = days.reduce<
    Array<{ key: string; label: string; dayCount: number }>
  >((segments, date) => {
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const currentSegment = segments.at(-1);

    if (currentSegment?.key === key) {
      currentSegment.dayCount += 1;
      return segments;
    }

    segments.push({
      key,
      label: new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
      }).format(date),
      dayCount: 1,
    });
    return segments;
  }, []);
  const monthYearFormat = new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  });
  const periodLabel =
    scale === "month"
      ? `${monthYearFormat.format(rangeStart)} – ${monthYearFormat.format(rangeEnd)}`
      : `${formatTimelineRange(rangeStart, addDays(rangeStart, 6))}, ${addDays(rangeStart, 6).getFullYear()}`;
  const scheduledGroups = groups
    .map((group) => ({
      group,
      tasks: group.tasks
        .map((task): TimelineTask | null => {
          const first = parseTimelineDate(task.startDate || task.dueDate);
          const second = parseTimelineDate(task.dueDate || task.startDate);

          if (!first || !second) {
            return null;
          }

          return first <= second
            ? { task, start: first, end: second }
            : { task, start: second, end: first };
        })
        .filter(
          (entry): entry is TimelineTask =>
            entry !== null && entry.end >= rangeStart && entry.start <= rangeEnd,
        )
        .sort((first, second) => first.start.getTime() - second.start.getTime()),
    }))
    .filter((entry) => entry.tasks.length);
  const scheduledTaskCount = scheduledGroups.reduce(
    (total, entry) => total + entry.tasks.length,
    0,
  );
  const unscheduledTasks = groups.flatMap((group) =>
    group.tasks
      .filter(
        (task) =>
          !parseTimelineDate(task.startDate) && !parseTimelineDate(task.dueDate),
      )
      .map((task) => ({ task, group })),
  );

  useEffect(() => {
    const scroller = timelineScrollerRef.current;

    if (!scroller) {
      return;
    }

    const index = timelineDayDifference(new Date(), new Date(rangeStartTime));
    const showToday =
      scrollTargetRef.current === "today" && index >= 0 && index < dayCount;

    scroller.scrollLeft = showToday
      ? Math.max(
          0,
          index * dayWidth - (scroller.clientWidth - TIMELINE_SIDEBAR_WIDTH) / 3,
        )
      : 0;
  }, [rangeStartTime, dayCount, dayWidth, todayScrollRequest]);

  function changeScale(nextScale: TimelineScale) {
    scrollTargetRef.current = "today";
    setScale(nextScale);
  }

  function goToToday() {
    scrollTargetRef.current = "today";
    setAnchorDate(new Date());
    setTodayScrollRequest((request) => request + 1);
  }

  function movePeriod(direction: -1 | 1) {
    scrollTargetRef.current = "start";
    setAnchorDate((currentDate) =>
      scale === "month"
        ? new Date(
            currentDate.getFullYear(),
            currentDate.getMonth() + direction,
            1,
          )
        : addDays(currentDate, direction * 7),
    );
  }

  function toggleGroup(groupId: number) {
    setCollapsedGroupIds((currentIds) =>
      currentIds.includes(groupId)
        ? currentIds.filter((id) => id !== groupId)
        : [...currentIds, groupId],
    );
  }

  function startTimelinePan(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    if (
      event.button !== 0 ||
      target.closest("button, input, [data-timeline-task]")
    ) {
      return;
    }

    timelinePanRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  }

  function moveTimelinePan(event: React.PointerEvent<HTMLDivElement>) {
    const pan = timelinePanRef.current;

    if (!pan.active || pan.pointerId !== event.pointerId) {
      return;
    }

    const distance = event.clientX - pan.startX;
    event.currentTarget.scrollLeft = pan.startScrollLeft - distance;

    if (Math.abs(distance) > 4) {
      event.preventDefault();
    }
  }

  function finishTimelinePan(event: React.PointerEvent<HTMLDivElement>) {
    const pan = timelinePanRef.current;

    if (!pan.active || pan.pointerId !== event.pointerId) {
      return;
    }

    const distance = event.clientX - pan.startX;
    const maximumScroll = Math.max(
      0,
      event.currentTarget.scrollWidth - event.currentTarget.clientWidth,
    );
    const atStart = event.currentTarget.scrollLeft <= 2;
    const atEnd = maximumScroll - event.currentTarget.scrollLeft <= 2;

    if (distance > 80 && atStart) {
      movePeriod(-1);
    } else if (distance < -80 && atEnd) {
      movePeriod(1);
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    timelinePanRef.current.active = false;
    setIsPanning(false);
  }

  function renderGroupRow(
    id: number,
    label: React.ReactNode,
    count: number,
  ) {
    const collapsed = collapsedGroupIds.includes(id);

    return (
      <div className="flex" style={{ height: TIMELINE_GROUP_HEIGHT }}>
        <button
          type="button"
          onClick={() => toggleGroup(id)}
          aria-expanded={!collapsed}
          className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-white/10 bg-[#121212] px-3 text-left"
          style={{ width: TIMELINE_SIDEBAR_WIDTH }}
        >
          <ChevronDownIcon
            className={`size-3.5 shrink-0 text-white/45 transition-transform ${
              collapsed ? "-rotate-90" : ""
            }`}
          />
          {label}
          <span className="text-xs font-semibold text-white/40">{count}</span>
        </button>
        <div className="shrink-0" style={{ width: timelineWidth }} />
      </div>
    );
  }

  function renderTaskRow(
    task: Task,
    group: StatusGroup,
    schedule?: { start: Date; end: Date },
  ) {
    const rangeLabel = schedule
      ? formatTimelineRange(schedule.start, schedule.end)
      : "";

    return (
      <div
        key={task.id}
        className="group/row flex"
        style={{ height: TIMELINE_ROW_HEIGHT }}
      >
        <button
          type="button"
          onClick={() => setDetailTaskId(task.id)}
          className="sticky left-0 z-20 flex shrink-0 items-center gap-2.5 border-r border-white/10 bg-[#121212] pl-9 pr-3 text-left"
          style={{ width: TIMELINE_SIDEBAR_WIDTH }}
        >
          <span className="pointer-events-none absolute inset-0 bg-white/[0.03] opacity-0 transition-opacity group-hover/row:opacity-100" />
          <span
            className={`relative size-3 shrink-0 rounded-full border-2 ${statusDotClass(group.tone, group.category)}`}
          />
          <span
            className={`relative min-w-0 flex-1 truncate text-[13px] font-medium ${
              schedule ? "text-white/80" : "text-white/60"
            }`}
          >
            {task.name}
          </span>
          <span className="relative shrink-0 text-[11px] text-white/35">
            {schedule ? rangeLabel : "Set dates"}
          </span>
        </button>
        <div className="relative shrink-0" style={{ width: timelineWidth }}>
          <span className="pointer-events-none absolute inset-0 bg-white/[0.03] opacity-0 transition-opacity group-hover/row:opacity-100" />
          {schedule ? renderTaskBar(task, schedule.start, schedule.end, rangeLabel) : null}
        </div>
      </div>
    );
  }

  function renderTaskBar(task: Task, start: Date, end: Date, rangeLabel: string) {
    const clippedStart = start < rangeStart;
    const clippedEnd = end > rangeEnd;
    const visibleStart = clippedStart ? rangeStart : start;
    const visibleEnd = clippedEnd ? rangeEnd : end;
    const left = timelineDayDifference(visibleStart, rangeStart) * dayWidth + 3;
    const width =
      (timelineDayDifference(visibleEnd, visibleStart) + 1) * dayWidth - 6;
    const estimatedLabelWidth = task.name.length * 6.5 + 20;
    const labelOutside =
      estimatedLabelWidth > width &&
      left + width + estimatedLabelWidth < timelineWidth;

    return (
      <button
        type="button"
        data-timeline-task
        onClick={() => setDetailTaskId(task.id)}
        title={`${task.name} · ${rangeLabel}${task.assignee ? ` · ${task.assignee}` : ""}`}
        className={`absolute top-1.5 flex h-7 items-center px-2.5 text-xs font-semibold shadow-sm transition hover:brightness-110 ${statusColorClass(task.tone, "badge")} ${
          clippedStart ? "" : "rounded-l-md"
        } ${clippedEnd ? "" : "rounded-r-md"}`}
        style={{ left, width }}
      >
        {labelOutside ? (
          <span className="absolute left-full top-1/2 ml-2 max-w-[260px] -translate-y-1/2 truncate font-medium text-white/75">
            {task.name}
          </span>
        ) : (
          <span className="truncate">{task.name}</span>
        )}
      </button>
    );
  }

  return (
    <>
      <main className="h-[calc(100vh-121px)] min-h-0 min-w-0 flex-none overflow-hidden px-4 py-4">
        <section className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#121212]">
          <header className="flex min-h-12 items-center justify-between gap-4 border-b border-white/10 px-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex items-center rounded-md border border-white/10 bg-white/[0.03] p-0.5">
                {(["month", "week"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => changeScale(mode)}
                    className={`h-7 rounded px-2.5 text-xs font-semibold transition ${
                      scale === mode
                        ? "bg-white/10 text-white"
                        : "text-white/45 hover:text-white/75"
                    }`}
                  >
                    {mode === "month" ? "Monthly" : "Weekly"}
                  </button>
                ))}
              </div>
              <div className="ml-1 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => movePeriod(-1)}
                  title="Previous period"
                  aria-label="Previous period"
                  className="flex size-7 items-center justify-center rounded text-white/45 hover:bg-white/10 hover:text-white"
                >
                  <ChevronLeftIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={goToToday}
                  className="h-7 rounded border border-white/10 px-2.5 text-xs font-semibold text-white/65 hover:bg-white/10 hover:text-white"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => movePeriod(1)}
                  title="Next period"
                  aria-label="Next period"
                  className="flex size-7 items-center justify-center rounded text-white/45 hover:bg-white/10 hover:text-white"
                >
                  <ChevronRightIcon className="size-4" />
                </button>
              </div>
              <h2 className="ml-1 truncate text-sm font-semibold text-white/80">
                {periodLabel}
              </h2>
            </div>
            <p className="shrink-0 text-xs text-white/40">
              {scheduledTaskCount} scheduled
              {unscheduledTasks.length
                ? ` · ${unscheduledTasks.length} without dates`
                : ""}
            </p>
          </header>

          <div
            ref={timelineScrollerRef}
            onPointerDown={startTimelinePan}
            onPointerMove={moveTimelinePan}
            onPointerUp={finishTimelinePan}
            onPointerCancel={finishTimelinePan}
            className={`min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain [scrollbar-color:rgba(255,255,255,0.22)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-corner]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 ${
              isPanning ? "cursor-grabbing select-none" : "cursor-grab"
            }`}
          >
            <div
              className="timeline-grid relative flex min-h-full flex-col"
              style={{ width: TIMELINE_SIDEBAR_WIDTH + timelineWidth }}
            >
              <div
                className="sticky top-0 z-30 flex shrink-0 border-b border-white/10 bg-[#151515]"
                style={{ height: TIMELINE_HEADER_HEIGHT }}
              >
                <div
                  className="sticky left-0 z-10 flex shrink-0 items-end gap-2 border-r border-white/10 bg-[#151515] px-3 pb-2.5"
                  style={{ width: TIMELINE_SIDEBAR_WIDTH }}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
                    Tasks
                  </span>
                </div>
                <div className="flex shrink-0 flex-col" style={{ width: timelineWidth }}>
                  <div className="flex h-6 shrink-0 border-b border-white/10">
                    {monthSegments.map((segment) => (
                      <div
                        key={segment.key}
                        style={{ width: segment.dayCount * dayWidth }}
                        className="shrink-0 border-r border-white/10"
                      >
                        <span
                          className="sticky inline-block whitespace-nowrap px-2.5 text-[11px] font-semibold leading-6 text-white/55"
                          style={{ left: TIMELINE_SIDEBAR_WIDTH }}
                        >
                          {segment.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex min-h-0 flex-1">
                    {days.map((date) => {
                      const isToday = sameTimelineDate(date, today);
                      const isWeekend = date.getDay() === 0 || date.getDay() === 6;

                      return (
                        <div
                          key={date.toISOString()}
                          style={{ width: dayWidth }}
                          className={`flex shrink-0 items-center justify-center border-r border-white/10 text-[10px] ${
                            scale === "month" ? "flex-col" : "gap-1.5"
                          } ${isWeekend ? "timeline-weekend" : ""}`}
                        >
                          <span
                            className={`font-semibold uppercase ${
                              isToday ? "text-[#7d96ff]" : "text-white/35"
                            }`}
                          >
                            {new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}
                          </span>
                          <span
                            className={`flex size-5.5 items-center justify-center rounded-full text-xs font-semibold ${
                              isToday ? "bg-[#5b7cff] text-white" : "text-white/70"
                            }`}
                          >
                            {date.getDate()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div
                aria-hidden="true"
                className="timeline-grid-lines pointer-events-none absolute bottom-0"
                style={{
                  top: TIMELINE_HEADER_HEIGHT,
                  left: TIMELINE_SIDEBAR_WIDTH,
                  width: timelineWidth,
                  backgroundSize: `${dayWidth}px 100%`,
                }}
              >
                {days.map((date, index) =>
                  date.getDay() === 0 || date.getDay() === 6 ? (
                    <span
                      key={date.toISOString()}
                      className="timeline-weekend absolute inset-y-0"
                      style={{ left: index * dayWidth, width: dayWidth }}
                    />
                  ) : null,
                )}
                {todayInRange ? (
                  <>
                    <span
                      className="absolute inset-y-0 bg-[#5b7cff]/[0.07]"
                      style={{ left: todayIndex * dayWidth, width: dayWidth }}
                    />
                    <span
                      className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-[#5b7cff]/70"
                      style={{ left: todayIndex * dayWidth + dayWidth / 2 }}
                    />
                  </>
                ) : null}
              </div>

              <div className="relative z-10 flex flex-1 flex-col">
                {scheduledGroups.map(({ group, tasks }) => (
                  <div key={group.id}>
                    {renderGroupRow(
                      group.id,
                      <span
                        className={`truncate rounded-md px-2 py-0.5 text-[11px] font-semibold ${statusColorClass(group.tone, "badge")}`}
                      >
                        {group.label}
                      </span>,
                      tasks.length,
                    )}
                    {collapsedGroupIds.includes(group.id)
                      ? null
                      : tasks.map(({ task, start, end }) =>
                          renderTaskRow(task, group, { start, end }),
                        )}
                  </div>
                ))}

                {!scheduledGroups.length ? (
                  <div className="flex h-28">
                    <div
                      className="sticky left-0 z-20 shrink-0 border-r border-white/10 bg-[#121212]"
                      style={{ width: TIMELINE_SIDEBAR_WIDTH }}
                    />
                    <div className="shrink-0" style={{ width: timelineWidth }}>
                      <div
                        className="sticky flex h-full flex-col justify-center px-6"
                        style={{ left: TIMELINE_SIDEBAR_WIDTH }}
                      >
                        <p className="text-sm font-semibold text-white/60">
                          No scheduled tasks in this period
                        </p>
                        <p className="mt-1 text-xs text-white/35">
                          Give a task a start or due date to place it on the timeline.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {unscheduledTasks.length ? (
                  <div>
                    {renderGroupRow(
                      TIMELINE_UNSCHEDULED_GROUP_ID,
                      <span className="truncate text-xs font-semibold text-white/55">
                        No dates
                      </span>,
                      unscheduledTasks.length,
                    )}
                    {collapsedGroupIds.includes(TIMELINE_UNSCHEDULED_GROUP_ID)
                      ? null
                      : unscheduledTasks.map(({ task, group }) =>
                          renderTaskRow(task, group),
                        )}
                  </div>
                ) : null}

                <div className="flex flex-1">
                  <div
                    className="sticky left-0 z-20 shrink-0 border-r border-white/10 bg-[#121212]"
                    style={{ width: TIMELINE_SIDEBAR_WIDTH }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <TaskDetailModal
        key={detailTask?.id ?? "empty-timeline-task-detail"}
        task={detailTask}
        groups={groups}
        members={members}
        workspaceTags={workspaceTags}
        projectId={projectId}
        onCreateWorkspaceTag={createWorkspaceTag}
        onUpdateTask={updateTaskFields}
        onPatchTask={patchTask}
        onMoveTaskToStatus={moveTaskToStatus}
        onClose={() => setDetailTaskId(null)}
      />
    </>
  );
}

function StatusBadge({ task }: { task: Task }) {
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusColorClass(task.tone, "badge")}`}
    >
      {task.status.length > 11 ? `${task.status.slice(0, 10)}...` : task.status}
    </span>
  );
}

function statusColorClass(
  color: string,
  variant: "badge" | "swatch",
) {
  if (variant === "swatch") {
    switch (color) {
      case "teal":
        return "bg-teal-500";
      case "blue":
        return "bg-blue-500";
      case "green":
        return "bg-green-500";
      case "orange":
        return "bg-orange-400";
      case "purple":
        return "bg-purple-500";
      default:
        return "bg-white/35";
    }
  }

  switch (color) {
    case "teal":
      return "status-colored-badge bg-teal-500 text-white";
    case "blue":
      return "status-colored-badge bg-blue-500 text-white";
    case "green":
      return "status-colored-badge bg-green-500 text-white";
    case "orange":
      return "status-colored-badge bg-orange-400 text-white";
    case "purple":
      return "status-colored-badge bg-purple-500 text-white";
    default:
      return "status-colored-badge status-neutral-badge bg-white/10 text-white";
  }
}

function statusDotClass(color: string, category: StatusCategory) {
  if (category === "not_started") {
    return "border-white/45 border-dashed bg-transparent";
  }

  if (category === "closed") {
    return "border-green-500 bg-green-500";
  }

  switch (color) {
    case "teal":
      return "border-teal-500";
    case "blue":
      return "border-blue-500";
    case "green":
      return "border-green-500";
    case "orange":
      return "border-orange-300";
    case "purple":
      return "border-purple-500";
    default:
      return "border-white/45 bg-transparent";
  }
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function priorityColorClass(priority: string) {
  switch (priority.toLowerCase()) {
    case "urgent":
      return "text-red-400";
    case "high":
      return "text-yellow-300";
    case "normal":
      return "text-blue-500";
    case "low":
      return "text-white/40";
    default:
      return "text-white/65";
  }
}

function getTaskAssigneeIds(task: Task) {
  if (task.assigneeIds?.length) {
    return task.assigneeIds;
  }

  return task.assigneeId ? [task.assigneeId] : [];
}

function getAssigneeInitials(assigneeIds: number[], members: ProjectMember[]) {
  return assigneeIds
    .map((assigneeId) => members.find((member) => member.id === assigneeId))
    .filter((member): member is ProjectMember => Boolean(member))
    .map((member) => getInitials(member.name))
    .join(", ");
}

function getAssigneeBadges(assignee: string) {
  if (!assignee.trim()) {
    return [];
  }

  return assignee.includes(",")
    ? assignee.split(",").map((value) => value.trim()).filter(Boolean)
    : assignee.split(/\s+/).map((value) => value.trim()).filter(Boolean);
}

function AssigneeAvatars({ assignee }: { assignee: string }) {
  const assignees = getAssigneeBadges(assignee);

  if (!assignees.length) {
    return <UserCircleIcon className="size-4.5 text-white/35" />;
  }

  if (assignees.length > 2) {
    return (
      <span className="flex items-center">
        <span className="relative z-10 flex size-6 items-center justify-center rounded-full bg-pink-500 text-[11px] font-semibold text-white">
          {assignees[0]}
        </span>
        <span className="relative z-0 -ml-1.5 flex size-6 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white/75 ring-2 ring-[#0f0f10]">
          +{assignees.length - 1}
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-center">
      {assignees.map((value, index) => (
        <span
          key={`${value}-${index}`}
          style={{ zIndex: assignees.length - index }}
          className={`flex size-6 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-black ring-2 ring-[#0f0f10] ${
            index ? "-ml-1.5" : ""
          }`}
        >
          {value}
        </span>
      ))}
    </span>
  );
}

function formatNumericDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  }).format(new Date(`${date}T00:00:00`));
}

function formatWeekdayDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
  }).format(new Date(`${date}T00:00:00`));
}

const TODAY_DATE = new Date(2026, 6, 9);
const TODAY_ISO = toDateInputValue(TODAY_DATE);

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

function formatMonthTitle(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDateSideLabel(date: Date) {
  const diffDays = Math.round(
    (date.getTime() - TODAY_DATE.getTime()) / 86_400_000,
  );

  if (diffDays >= 0 && diffDays <= 6) {
    return new Intl.DateTimeFormat("en", { weekday: "short" }).format(date);
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatSmartStartDate(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  const diffDays = Math.round(
    (parsedDate.getTime() - TODAY_DATE.getTime()) / 86_400_000,
  );

  if (diffDays >= 0 && diffDays <= 6) {
    return formatWeekdayDate(date);
  }

  return formatNumericDate(date);
}

function getMonthDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDate = new Date(year, month, 1);
  const startDate = addDays(firstDate, -firstDate.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(startDate, index);

    return {
      date: toDateInputValue(date),
      label: `${date.getDate()}`,
      muted: date.getMonth() !== month,
    };
  });
}

function DatePickerPopover({
  startDate,
  dueDate,
  activeField,
  onActiveFieldChange,
  onSelect,
  onClear,
}: {
  startDate: string;
  dueDate: string;
  activeField: "start" | "due";
  onActiveFieldChange: (field: "start" | "due") => void;
  onSelect: (date: string) => void;
  onClear: (field: "start" | "due") => void;
}) {
  const initialMonth = dueDate || startDate || TODAY_ISO;
  const [monthDate, setMonthDate] = useState(
    () => new Date(`${initialMonth.slice(0, 7)}-01T00:00:00`),
  );
  const quickDates = [
    ["Today", TODAY_DATE, formatDateSideLabel(TODAY_DATE)],
    ["Later", TODAY_DATE, "2:20 am"],
    ["Tomorrow", addDays(TODAY_DATE, 1), formatDateSideLabel(addDays(TODAY_DATE, 1))],
    ["This weekend", addDays(TODAY_DATE, 2), formatDateSideLabel(addDays(TODAY_DATE, 2))],
    ["Next week", addDays(TODAY_DATE, 4), formatDateSideLabel(addDays(TODAY_DATE, 4))],
    ["Next weekend", addDays(TODAY_DATE, 9), formatDateSideLabel(addDays(TODAY_DATE, 9))],
    ["2 weeks", addDays(TODAY_DATE, 14), formatDateSideLabel(addDays(TODAY_DATE, 14))],
    ["4 weeks", addDays(TODAY_DATE, 28), formatDateSideLabel(addDays(TODAY_DATE, 28))],
  ] as const;
  const days = getMonthDays(monthDate);
  const selectedStartTime = startDate
    ? new Date(`${startDate}T00:00:00`).getTime()
    : null;
  const selectedDueTime = dueDate
    ? new Date(`${dueDate}T00:00:00`).getTime()
    : null;

  return (
    <div data-floating-popover className="absolute left-0 top-8 z-40 w-[430px] overflow-hidden rounded-lg border border-white/10 bg-[#181818] shadow-xl">
      <div className="grid grid-cols-2 gap-1.5 border-b border-white/10 p-1.5">
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onActiveFieldChange("start");
          }}
          className={`flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-xs font-semibold ${
            activeField === "start"
              ? "border border-white/80 bg-[#202020] text-white"
              : "bg-white/5 text-white/45"
          }`}
        >
          <CalendarDaysIcon className="size-3.5 text-white/80" />
          <span className="min-w-0 flex-1 truncate">
            {startDate ? formatSmartStartDate(startDate) : "Start date"}
          </span>
          {startDate ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onClear("start");
              }}
              className="flex size-4 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/50 hover:text-white"
            >
              <XMarkIcon className="size-3" />
            </span>
          ) : null}
          <span className="shrink-0 text-white/35">Add time</span>
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onActiveFieldChange("due");
          }}
          className={`flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-xs font-semibold ${
            activeField === "due"
              ? "border border-white/80 bg-[#202020] text-white"
              : "bg-white/5 text-white/45"
          }`}
        >
          <CalendarDaysIcon className="size-3.5 text-white/80" />
          <span className="min-w-0 flex-1 truncate">
            {dueDate ? formatNumericDate(dueDate) : "Due date"}
          </span>
          {dueDate ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onClear("due");
              }}
              className="flex size-4 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/50 hover:text-white"
            >
              <XMarkIcon className="size-3" />
            </span>
          ) : null}
          <span className="shrink-0 text-white/35">Add time</span>
        </button>
      </div>

      <div className="grid grid-cols-[180px_1fr]">
        <div className="border-r border-white/10 py-2">
          {quickDates.map(([label, date, suffix]) => (
            <button
              key={label}
              type="button"
              onClick={() => onSelect(toDateInputValue(date))}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-white/85 hover:bg-white/10"
            >
              <span>{label}</span>
              <span className="text-white/35">{suffix}</span>
            </button>
          ))}
        </div>

        <div className="p-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              {formatMonthTitle(monthDate)}
            </h3>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setMonthDate(new Date(2026, 6, 1));
                }}
                className="text-xs font-semibold text-white/65 hover:text-white"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() =>
                  setMonthDate(
                    (currentMonth) =>
                      new Date(
                        currentMonth.getFullYear(),
                        currentMonth.getMonth() - 1,
                        1,
                      ),
                  )
                }
                aria-label="Previous month"
              >
                <ChevronDownIcon className="size-3.5 rotate-180 text-white/60" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setMonthDate(
                    (currentMonth) =>
                      new Date(
                        currentMonth.getFullYear(),
                        currentMonth.getMonth() + 1,
                        1,
                      ),
                  )
                }
                aria-label="Next month"
              >
                <ChevronDownIcon className="size-3.5 text-white/60" />
              </button>
            </div>
          </div>
          <div className="mb-1.5 grid grid-cols-7 text-center text-xs font-semibold text-white/35">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 text-center text-xs">
            {days.map(({ date, label, muted }, index) => {
              const currentTime = new Date(`${date}T00:00:00`).getTime();
              const isToday = date === TODAY_ISO;
              const isStart = date === startDate;
              const isDue = date === dueDate;
              const hasRange =
                selectedStartTime !== null &&
                selectedDueTime !== null &&
                selectedStartTime <= selectedDueTime;
              const isBetween =
                hasRange &&
                currentTime > selectedStartTime &&
                currentTime < selectedDueTime;
              const previousDay = days[index - 1];
              const nextDay = days[index + 1];
              const previousTime = previousDay
                ? new Date(`${previousDay.date}T00:00:00`).getTime()
                : null;
              const nextTime = nextDay
                ? new Date(`${nextDay.date}T00:00:00`).getTime()
                : null;
              const previousInRange =
                hasRange &&
                previousTime !== null &&
                previousTime >= selectedStartTime &&
                previousTime <= selectedDueTime &&
                index % 7 !== 0;
              const nextInRange =
                hasRange &&
                nextTime !== null &&
                nextTime >= selectedStartTime &&
                nextTime <= selectedDueTime &&
                index % 7 !== 6;
              const rangeShape =
                isBetween && !previousInRange
                  ? "rounded-l-md"
                  : isBetween && !nextInRange
                    ? "rounded-r-md"
                    : "";

              return (
              <button
                key={date}
                type="button"
                onClick={() => onSelect(date)}
                className={`flex h-7 w-full items-center justify-center ${
                  isStart || isDue
                    ? "rounded-md bg-white text-black"
                    : isBetween
                      ? `bg-white/10 text-white/85 ${rangeShape}`
                    : isToday
                    ? "bg-red-600 text-white"
                    : muted
                      ? "rounded-md text-white/25 hover:bg-white/10"
                      : "rounded-md text-white/85 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PriorityPopover({ onSelect }: { onSelect: (value: string) => void }) {
  const options = [
    ["Urgent", "text-red-400"],
    ["High", "text-yellow-300"],
    ["Normal", "text-blue-500"],
    ["Low", "text-white/35"],
  ];

  return (
    <div data-floating-popover className="absolute left-0 top-8 z-40 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#181818] py-2 shadow-xl">
      <p className="px-4 py-2 text-sm font-semibold text-white/35">Priority</p>
      {options.map(([label, color]) => (
        <button
          key={label}
          type="button"
          onClick={() => onSelect(label)}
          className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-white/85 hover:bg-white/10"
        >
          <span className={color}>⚑</span>
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onSelect("")}
        className="mt-2 flex w-full items-center gap-3 border-t border-white/10 px-4 py-2 text-left text-sm text-white/70 hover:bg-white/10"
      >
        <span>⊘</span>
        Clear
      </button>
    </div>
  );
}

function StatusPickerPopover({
  groups,
  currentStatus,
  search,
  onSearchChange,
  onSelect,
}: {
  groups: StatusGroup[];
  currentStatus: string;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (status: StatusGroup) => void;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const filteredGroups = groups.filter((group) =>
    group.label.toLowerCase().includes(normalizedSearch),
  );

  return (
    <div data-floating-popover className="absolute left-0 top-8 z-40 w-60 overflow-hidden rounded-xl border border-white/10 bg-[#1d1d1d] shadow-xl">
      <div className="border-b border-white/10 p-1.5">
        <div className="rounded-md bg-[#111] px-3 py-2 text-center text-sm font-semibold text-white">
          Status
        </div>
      </div>
      <div className="border-b border-white/10 p-1.5">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search..."
          autoFocus
          className="h-8 w-full rounded-md border border-white/25 bg-[#202020] px-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-white/80"
        />
      </div>
      <div className="max-h-80 overflow-y-auto py-1">
        {STATUS_CATEGORIES.map((category) => {
          const categoryGroups = filteredGroups.filter(
            (group) => group.category === category,
          );

          if (!categoryGroups.length) {
            return null;
          }

          return (
            <div key={category} className="border-b border-white/5 py-1 last:border-b-0">
              <p className="px-3 py-1.5 text-xs font-semibold text-white/35">
                {STATUS_CATEGORY_LABELS[category]}
              </p>
              {categoryGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => onSelect(group)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-white/85 hover:bg-white/10 ${
                    group.label === currentStatus ? "bg-white/10" : ""
                  }`}
                >
                  <span
                    className={`size-3.5 rounded-full border-2 ${statusDotClass(group.tone, group.category)}`}
                  />
                  <span className="flex-1 truncate">{group.label}</span>
                  {group.label === currentStatus ? (
                    <span className="text-lg leading-none text-white">✓</span>
                  ) : null}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TagPopover({
  value,
  options = [],
  onChange,
  onSelect,
  onCreate,
}: {
  value: string;
  options?: WorkspaceTag[];
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  onCreate: () => void;
}) {
  const normalizedValue = value.trim().toLowerCase();
  const filteredOptions = options.filter((option) =>
    option.name.toLowerCase().includes(normalizedValue),
  );
  const hasExactMatch = options.some(
    (option) => option.name.toLowerCase() === normalizedValue,
  );

  return (
    <div data-floating-popover className="absolute left-0 top-9 z-40 w-56 overflow-hidden rounded-lg border border-white/10 bg-[#181818] shadow-xl">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCreate();
          }
        }}
        autoFocus
        placeholder="Search or create tag"
        className="h-9 w-full border-b border-white/10 bg-[#202020] px-3 text-xs text-white outline-none placeholder:text-white/35"
      />
      <div className="p-2">
        <p className="mb-1.5 text-xs font-semibold text-white/35">Select an option</p>
        <div className="max-h-36 space-y-1 overflow-y-auto">
          {filteredOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect?.(option.name)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-white/75 hover:bg-white/10"
            >
              <span className="size-2.5 rounded-full bg-[#5126b8]" />
              <span className="truncate">{option.name}</span>
            </button>
          ))}
        </div>
        {value.trim() && !hasExactMatch ? (
          <button
            type="button"
            onClick={onCreate}
            className="mt-1 flex w-full items-center gap-2 rounded-md bg-white/10 px-2 py-1.5 text-left text-xs text-white/65 hover:bg-white/15"
          >
            Create
            <span className="rounded-full bg-[#5126b8] px-1.5 py-0.5 text-white">
              {value.trim()}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CreateTaskModal({
  open,
  projectId,
  workspaceId,
  projectName,
  groups,
  onCreated,
  onClose,
}: {
  open: boolean;
  projectId: number;
  workspaceId: number;
  projectName: string;
  groups: StatusGroup[];
  onCreated: (task: Task, statusId: number) => void;
  onClose: () => void;
}) {
  const [taskName, setTaskName] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [selectedStatusId, setSelectedStatusId] = useState(groups[0]?.id ?? 0);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<number[]>([]);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [workspaceTags, setWorkspaceTags] = useState<WorkspaceTag[]>([]);
  const [openPicker, setOpenPicker] = useState<
    "status" | "assignee" | "date" | "priority" | "tags" | null
  >(null);
  const [activeDateField, setActiveDateField] = useState<"start" | "due">("due");
  const [creatingTask, setCreatingTask] = useState(false);

  const selectedStatus =
    groups.find((group) => group.id === selectedStatusId) ?? groups[0];
  const selectedAssignees = members.filter((member) =>
    selectedAssigneeIds.includes(member.id),
  );

  const resetTaskModal = useCallback(() => {
    setTaskName("");
    setDescription("");
    setSelectedStatusId(groups[0]?.id ?? 0);
    setSelectedAssigneeIds([]);
    setStartDate("");
    setDueDate("");
    setPriority("");
    setTags([]);
    setTagInput("");
    setOpenPicker(null);
    setActiveDateField("due");
  }, [groups]);

  useEffect(() => {
    if (!open) {
      return;
    }

    fetch(`/api/projects/${projectId}/members`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { members?: ProjectMember[] } | null) => {
        setMembers(data?.members ?? []);
      })
      .catch(() => setMembers([]));
  }, [groups, open, projectId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    fetch(`/api/workspaces/${workspaceId}/tags`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { tags?: WorkspaceTag[] } | null) => {
        setWorkspaceTags(data?.tags ?? []);
      })
      .catch(() => setWorkspaceTags([]));
  }, [open, workspaceId]);

  async function createWorkspaceTag(name: string) {
    const tagName = name.trim();

    if (!tagName) {
      return null;
    }

    const existingTag = workspaceTags.find(
      (tag) => tag.name.toLowerCase() === tagName.toLowerCase(),
    );

    if (existingTag) {
      return existingTag;
    }

    const response = await fetch(`/api/workspaces/${workspaceId}/tags`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: tagName }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { tag?: WorkspaceTag };

    if (data.tag) {
      setWorkspaceTags((currentTags) => [...currentTags, data.tag!]);
      return data.tag;
    }

    return null;
  }

  async function submitTask() {
    if (!taskName.trim() || !selectedStatus) {
      return;
    }

    setCreatingTask(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: taskName,
          statusId: selectedStatus.id,
          assigneeIds: selectedAssigneeIds,
          startDate,
          dueDate,
          priority,
          description,
          tags,
        }),
      });

      const responseText = await response.text();
      const data = (responseText ? JSON.parse(responseText) : {}) as {
        task?: Task;
      };

      if (response.ok && data.task) {
        onCreated(
          {
            ...data.task,
            assigneeId: selectedAssigneeIds[0] ?? null,
            assigneeIds: selectedAssigneeIds,
            assignee:
              selectedAssignees.map((member) => getInitials(member.name)).join(", ") ||
              data.task.assignee,
            due: dueDate ? formatNumericDate(dueDate) : "",
            dueDate,
            priority,
            tags,
            status: selectedStatus.label,
            tone: selectedStatus.tone,
          },
          selectedStatus.id,
        );
        resetTaskModal();
        onClose();
      }
    } finally {
      setCreatingTask(false);
    }
  }

  const closeTaskModal = useCallback(() => {
    onClose();
    window.setTimeout(resetTaskModal, 180);
  }, [onClose, resetTaskModal]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeCreateTaskOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      if (openPicker) {
        setOpenPicker(null);
        return;
      }

      closeTaskModal();
    }

    window.addEventListener("keydown", closeCreateTaskOnEscape, true);

    return () => {
      window.removeEventListener("keydown", closeCreateTaskOnEscape, true);
    };
  }, [closeTaskModal, open, openPicker]);

  useEffect(() => {
    if (!open || !openPicker) {
      return;
    }

    function closePickerOnOutsideClick(event: PointerEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.closest("[data-floating-popover]")) {
        return;
      }

      setOpenPicker(null);
    }

    document.addEventListener("pointerdown", closePickerOnOutsideClick);

    return () => {
      document.removeEventListener("pointerdown", closePickerOnOutsideClick);
    };
  }, [open, openPicker]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 transition-opacity duration-200 ease-out ${
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          closeTaskModal();
        }
      }}
      aria-hidden={!open}
    >
      <section
        role="dialog"
        aria-modal="true"
        onPointerDown={(event) => event.stopPropagation()}
        className={`w-full max-w-2xl overflow-visible rounded-lg border border-white/10 bg-[#191919] text-white shadow-[0_20px_50px_rgba(0,0,0,0.45)] transition-all duration-200 ease-out ${
          open ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.98] opacity-0"
        }`}
      >
        <header className="flex h-10 items-center justify-between border-b border-white/10 px-4">
          <nav className="flex h-full items-center gap-4 text-xs font-semibold text-white/45">
            <button className="flex h-full items-center border-b-2 border-white text-white">
              Task
            </button>
          </nav>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={closeTaskModal}
              className="flex size-6 items-center justify-center rounded-full bg-white/10 text-white/65 transition hover:bg-white/15 hover:text-white"
              aria-label="Close create task"
            >
              <XMarkIcon className="size-4" />
            </button>
          </div>
        </header>

        <div className="px-4 py-4">
          <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-white/60">
            <ClipboardDocumentListIcon className="size-3.5" />
            <span>{projectName}</span>
          </div>

          <input
            type="text"
            value={taskName}
            onChange={(event) => setTaskName(event.target.value)}
            placeholder="Task name"
            className="h-9 w-full rounded-md border border-white/10 bg-transparent px-3 text-base font-semibold text-white outline-none transition placeholder:text-white/35 focus:border-white/35 focus:ring-2 focus:ring-white/10"
          />

          <div className="mt-3">
            <TiptapDescription
              id="create-task-description"
              value={description}
              onChange={setDescription}
              placeholder="Add description, or write with AI"
              minHeight={120}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <div className="relative" data-floating-popover>
              <button
                type="button"
                onClick={() =>
                  setOpenPicker((picker) => (picker === "status" ? null : "status"))
                }
                className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                {selectedStatus?.label ?? "Status"}
              </button>
              {openPicker === "status" ? (
                <div data-floating-popover className="absolute left-0 top-8 z-40 w-44 rounded-lg border border-white/10 bg-[#202020] p-1 shadow-xl">
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => {
                        setSelectedStatusId(group.id);
                        setOpenPicker(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-white/75 hover:bg-white/10"
                    >
                      <span
                        className={`size-3 rounded-full border-2 ${statusDotClass(group.tone, group.category)}`}
                      />
                      {group.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="relative" data-floating-popover>
              <button
                type="button"
                onClick={() =>
                  setOpenPicker((picker) =>
                    picker === "assignee" ? null : "assignee",
                  )
                }
                className="flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[11px] font-semibold text-white/70"
              >
              <UsersIcon className="size-3.5" />
                {selectedAssignees.length
                  ? `${selectedAssignees.length} assignee${selectedAssignees.length > 1 ? "s" : ""}`
                  : "Assignee"}
              </button>
              {openPicker === "assignee" ? (
                <div data-floating-popover className="absolute left-0 top-8 z-40 w-56 rounded-lg border border-white/10 bg-[#202020] p-1 shadow-xl">
                  {members.length ? (
                    members.map((member) => {
                      const isSelected = selectedAssigneeIds.includes(member.id);

                      return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          setSelectedAssigneeIds((currentIds) =>
                            currentIds.includes(member.id)
                              ? currentIds.filter((id) => id !== member.id)
                              : [...currentIds, member.id],
                          );
                        }}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold hover:bg-white/10 ${
                          isSelected ? "bg-white/10 text-white" : "text-white/75"
                        }`}
                      >
                        <span className="flex size-5 items-center justify-center rounded-full bg-white text-[10px] text-black">
                          {getInitials(member.name)}
                        </span>
                        <span className="truncate">{member.name}</span>
                        <span className={`ml-auto size-2 rounded-full ${isSelected ? "bg-violet-500" : "bg-transparent"}`} />
                      </button>
                      );
                    })
                  ) : (
                    <p className="px-2 py-1.5 text-xs text-white/40">
                      Belum ada member
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="relative" data-floating-popover>
              <button
                type="button"
                onClick={() => {
                  setActiveDateField("due");
                  setOpenPicker((picker) => (picker === "date" ? null : "date"));
                }}
                className="flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[11px] font-semibold text-white/70"
              >
                <CalendarDaysIcon className="size-3.5" />
                <span>
                  {startDate && dueDate
                    ? `${formatNumericDate(startDate)} - ${formatNumericDate(dueDate)}`
                    : dueDate
                      ? formatNumericDate(dueDate)
                      : "Due date"}
                </span>
                {startDate || dueDate ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      setStartDate("");
                      setDueDate("");
                      setOpenPicker(null);
                    }}
                    className="flex size-4 items-center justify-center rounded-full bg-white/10 text-white/50 hover:text-white"
                  >
                    <XMarkIcon className="size-3" />
                  </span>
                ) : null}
              </button>
              {openPicker === "date" ? (
                <DatePickerPopover
                  startDate={startDate}
                  dueDate={dueDate}
                  activeField={activeDateField}
                  onActiveFieldChange={setActiveDateField}
                  onSelect={(date) => {
                    if (activeDateField === "start") {
                      if (
                        dueDate &&
                        new Date(`${date}T00:00:00`).getTime() >
                          new Date(`${dueDate}T00:00:00`).getTime()
                      ) {
                        setStartDate("");
                        setDueDate(date);
                        setActiveDateField("due");
                        return;
                      }

                      setStartDate(date);
                      if (!dueDate) {
                        setActiveDateField("due");
                      }

                      return;
                    }

                    if (
                      startDate &&
                      new Date(`${date}T00:00:00`).getTime() <
                        new Date(`${startDate}T00:00:00`).getTime()
                    ) {
                      setStartDate("");
                    }

                    setDueDate(date);
                    if (!startDate) {
                      setOpenPicker(null);
                    }
                  }}
                  onClear={(field) => {
                    if (field === "start") {
                      setStartDate("");
                      return;
                    }

                    setDueDate("");
                  }}
                />
              ) : null}
            </div>

            <div className="relative" data-floating-popover>
              <button
                type="button"
                onClick={() =>
                  setOpenPicker((picker) =>
                    picker === "priority" ? null : "priority",
                  )
                }
                className="flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[11px] font-semibold text-white/70"
              >
                <span className={priorityColorClass(priority)}>⚑</span>
                <span className={priorityColorClass(priority)}>
                  {priority || "Priority"}
                </span>
              </button>
              {openPicker === "priority" ? (
                <PriorityPopover
                  onSelect={(value) => {
                    setPriority(value);
                    setOpenPicker(null);
                  }}
                />
              ) : null}
            </div>

            <div className="relative" data-floating-popover>
              <button
                type="button"
                onClick={() =>
                  setOpenPicker((picker) => (picker === "tags" ? null : "tags"))
                }
                className="flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-[11px] font-semibold text-white/70"
              >
              <TagIcon className="size-3.5" />
                {tags.length ? tags.join(", ") : "Tags"}
              </button>
              {openPicker === "tags" ? (
                <TagPopover
                  value={tagInput}
                  options={workspaceTags}
                  onChange={setTagInput}
                  onSelect={(tagName) => {
                    setTags((currentTags) =>
                      currentTags.includes(tagName)
                        ? currentTags
                        : [...currentTags, tagName],
                    );
                    setTagInput("");
                    setOpenPicker(null);
                  }}
                  onCreate={() => {
                    if (tagInput.trim()) {
                      void createWorkspaceTag(tagInput).then((tag) => {
                        if (!tag) {
                          return;
                        }

                        setTags((currentTags) =>
                          currentTags.includes(tag.name)
                            ? currentTags
                            : [...currentTags, tag.name],
                        );
                        setTagInput("");
                        setOpenPicker(null);
                      });
                    }
                  }}
                />
              ) : null}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end border-t border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={submitTask}
            disabled={!taskName.trim() || creatingTask}
            className="rounded-md bg-white px-3 py-2 text-[11px] font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creatingTask ? "Creating..." : "Create Task"}
          </button>
        </footer>
      </section>
    </div>
  );
}
