"use client";

import RemoveMemberDialog from "@/components/remove-member-dialog";
import WorkspaceSortMenu from "@/components/workspace-sort-menu";
import {
  ArchiveBoxIcon,
  ArrowRightStartOnRectangleIcon,
  ArrowUpTrayIcon,
  ChevronDownIcon,
  Cog6ToothIcon,
  ComputerDesktopIcon,
  EllipsisHorizontalIcon,
  EnvelopeIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  TrashIcon,
  UserCircleIcon,
  UserIcon,
  UsersIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { GripVertical, Pin } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import FormsSidebar from "@/components/forms-sidebar";
import MessageToastWatcher from "@/components/message-toast-watcher";
import { WhatsAppGroupConnection } from "@/components/whatsapp-group-connection";

type TeamShellProps = {
  children: React.ReactNode;
};

type ThemePreference = "light" | "dark" | "system";

type Project = {
  id: number;
  workspaceId?: number;
  slug: string;
  viewSlug: string;
  name: string;
  description: string;
  permission: string;
  isOwner: boolean;
  isPrivate: boolean;
  isPinned: boolean;
  publishMode: "inherit" | "published" | "hidden";
};

type Workspace = {
  isArchived?: boolean;
  isPinned?: boolean;
  id: number;
  name: string;
  description: string;
  slug: string;
  isPublished: boolean;
  projects: Project[];
};

type WorkspaceMember = {
  id: number;
  name: string;
  email: string;
  direktorat: string;
  role: "owner" | "administrator" | "manager" | "collaborator";
  isOwner: boolean;
  projects: Array<{
    id: number;
    name: string;
  }>;
};

type UserOption = {
  id: number;
  name: string;
  email: string;
  direktorat: string;
};

type ProjectMember = {
  id: number;
  name: string;
  email: string;
  direktorat: string;
  permission: "Full akses" | "Manage" | "Collaborator";
  isOwner: boolean;
};

type DataRequestMonitoringLink = {
  taskId: number;
  taskName: string;
  requesterName: string;
  requesterEmail: string;
  path: string;
};

const workspaceRoles = ["administrator", "manager", "collaborator"] as const;
const workspaceRoleSections = ["owner", ...workspaceRoles] as const;
const projectPermissions = ["Full akses", "Manage", "Collaborator"] as const;

function sortProjects(projects: Project[]) {
  return [...projects].sort((firstProject, secondProject) => {
    if (firstProject.isPinned !== secondProject.isPinned) {
      return firstProject.isPinned ? -1 : 1;
    }

    return secondProject.id - firstProject.id;
  });
}

export default function TeamShell({ children }: TeamShellProps) {
  const pathname = usePathname();
  const projectsMenuRef = useRef<HTMLElement>(null);
  const projectsMenuButtonRef = useRef<HTMLButtonElement>(null);
  const createWorkspaceButtonRef = useRef<HTMLButtonElement>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const workspaceRowsRef = useRef(new Map<number, HTMLDivElement>());
  const workspacePositionsRef = useRef(new Map<number, number>());
  const workspacePinRequests = useRef(new Set<number>());
  const [workspacePinError, setWorkspacePinError] = useState("");
  useLayoutEffect(() => {
    for (const [id, top] of workspacePositionsRef.current) {
      const row = workspaceRowsRef.current.get(id);
      if (!row) continue;
      const offset = top - row.getBoundingClientRect().top;
      if (Math.abs(offset) > 1) row.animate([{transform: `translateY(${offset}px)`},{transform:"translateY(0)"}],{duration:320,easing:"cubic-bezier(0.22,1,0.36,1)"});
    }
    workspacePositionsRef.current.clear();
  }, [workspaces]);
  async function toggleWorkspacePin(id: number, isPinned: boolean) {
    if (workspacePinRequests.current.has(id)) return;
    workspacePinRequests.current.add(id);
    setWorkspacePinError("");
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const [key,row] of workspaceRowsRef.current) workspacePositionsRef.current.set(key,row.getBoundingClientRect().top);
      workspaceRowsRef.current.get(id)?.querySelector("[data-workspace-pin]")?.animate([{transform:"scale(1)"},{transform:"scale(1.35) rotate(-18deg)"},{transform:"scale(1)"}],{duration:380,easing:"ease-out"});
    }
    setWorkspaces(current => current.map(workspace => workspace.id === id ? {...workspace,isPinned} : workspace));
    try {
      const response = await fetch(`/api/workspaces/${id}/pin`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({isPinned})});
      if (!response.ok) throw new Error("Gagal menyimpan pin workspace.");
    } catch {
      setWorkspaces(current => current.map(workspace => workspace.id === id ? {...workspace,isPinned:!isPinned} : workspace));
      setWorkspacePinError("Pin workspace gagal disimpan. Coba lagi.");
    } finally { workspacePinRequests.current.delete(id); }
  }

  const projectRowsRef = useRef(new Map<number, HTMLDivElement>());
  const pinPositionsRef = useRef(new Map<number, number>());
  const pinRequestsRef = useRef(new Set<number>());
  useLayoutEffect(() => {
    const positions = pinPositionsRef.current;
    if (!positions.size) return;
    for (const [id, top] of positions) {
      const row = projectRowsRef.current.get(id);
      if (!row) continue;
      const offset = top - row.getBoundingClientRect().top;
      if (Math.abs(offset) > 1) row.animate(
        [{ transform: `translateY(${offset}px)` }, { transform: "translateY(0)" }],
        { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }
    positions.clear();
  }, [workspaces]);

  const [profileOpen, setProfileOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>("dark");
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeTransitionTimerRef = useRef<number | null>(null);
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<number[]>([]);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(0);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [createWorkspaceError, setCreateWorkspaceError] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const importCsvInputRef = useRef<HTMLInputElement>(null);
  const [importRequestsOpen, setImportRequestsOpen] = useState(false);
  const [importSheetUrl, setImportSheetUrl] = useState("");
  const [importWorkspaceName, setImportWorkspaceName] =
    useState("Permintaan Data");
  const [importCsv, setImportCsv] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState<{
    rows: number;
    created: number;
    updated: number;
    skipped: number;
    skippedRows?: Array<{ row: number; reason: string }>;
    projectsCreated: number;
  } | null>(null);
  const [importMonitoringLinks, setImportMonitoringLinks] = useState<
    DataRequestMonitoringLink[]
  >([]);
  const [copiedMonitoringTaskId, setCopiedMonitoringTaskId] = useState<
    number | null
  >(null);
  const [importing, setImporting] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [createProjectError, setCreateProjectError] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [workspaceSort, setWorkspaceSort] = useState("default");
  const [openWorkspaceMenuId, setOpenWorkspaceMenuId] = useState<number | null>(
    null,
  );
  const [openProjectMenuId, setOpenProjectMenuId] = useState<number | null>(null);
  const [manageWorkspaceOpen, setManageWorkspaceOpen] = useState(false);
  const [managedWorkspace, setManagedWorkspace] = useState<Workspace | null>(null);
  const [manageWorkspaceTab, setManageWorkspaceTab] = useState<
    "workspace" | "team"
  >("workspace");
  const [managedWorkspaceName, setManagedWorkspaceName] = useState("");
  const [managedWorkspaceDescription, setManagedWorkspaceDescription] =
    useState("");
  const [managedWorkspacePublished, setManagedWorkspacePublished] =
    useState(false);
  const [workspaceDetailsError, setWorkspaceDetailsError] = useState("");
  const [savingWorkspaceDetails, setSavingWorkspaceDetails] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [loadingWorkspaceMembers, setLoadingWorkspaceMembers] = useState(false);
  const [canManageWorkspaceMembers, setCanManageWorkspaceMembers] =
    useState(false);
  const [draggedWorkspaceMemberId, setDraggedWorkspaceMemberId] = useState<
    number | null
  >(null);
  const [workspaceRoleDropTarget, setWorkspaceRoleDropTarget] = useState<
    (typeof workspaceRoles)[number] | null
  >(null);
  const [addWorkspaceMemberOpen, setAddWorkspaceMemberOpen] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<{id: number; email: string; role: string}[]>([]);
  const [memberNotice, setMemberNotice] = useState("");
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [projectMemberToDelete, setProjectMemberToDelete] = useState<ProjectMember | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<WorkspaceMember | null>(null);
  const [deletingMember, setDeletingMember] = useState<number | null>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [selectedMember, setSelectedMember] = useState<UserOption | null>(null);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [loadingUserOptions, setLoadingUserOptions] = useState(false);
  const [memberRole, setMemberRole] =
    useState<(typeof workspaceRoles)[number]>("collaborator");
  const [memberProjectIds, setMemberProjectIds] = useState<number[]>([]);
  const [memberProjectSearch, setMemberProjectSearch] = useState("");
  const [openMemberProjectsId, setOpenMemberProjectsId] = useState<number | null>(
    null,
  );
  const [editingProjectSearch, setEditingProjectSearch] = useState("");
  const [memberError, setMemberError] = useState("");
  const [addingWorkspaceMember, setAddingWorkspaceMember] = useState(false);
  const [manageProjectOpen, setManageProjectOpen] = useState(false);
  const [managedProject, setManagedProject] = useState<Project | null>(null);
  const [manageProjectTab, setManageProjectTab] = useState<"project" | "team">(
    "project",
  );
  const [managedProjectName, setManagedProjectName] = useState("");
  const [managedProjectDescription, setManagedProjectDescription] =
    useState("");
  const [managedProjectPublishMode, setManagedProjectPublishMode] =
    useState<Project["publishMode"]>("inherit");
  const [projectDetailsError, setProjectDetailsError] = useState("");
  const [savingProjectDetails, setSavingProjectDetails] = useState(false);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [loadingProjectMembers, setLoadingProjectMembers] = useState(false);
  const [draggedProjectMemberId, setDraggedProjectMemberId] = useState<
    number | null
  >(null);
  const [projectPermissionDropTarget, setProjectPermissionDropTarget] =
    useState<ProjectMember["permission"] | null>(null);
  const [addProjectMemberOpen, setAddProjectMemberOpen] = useState(false);
  const [projectMemberSearch, setProjectMemberSearch] = useState("");
  const [selectedProjectMember, setSelectedProjectMember] =
    useState<UserOption | null>(null);
  const [projectUserOptions, setProjectUserOptions] = useState<UserOption[]>([]);
  const [loadingProjectUserOptions, setLoadingProjectUserOptions] =
    useState(false);
  const [projectMemberPermission, setProjectMemberPermission] =
    useState<(typeof projectPermissions)[number]>("Manage");
  const [projectMemberError, setProjectMemberError] = useState("");
  const [addingProjectMember, setAddingProjectMember] = useState(false);

  useEffect(() => {
    document.body.classList.add("team-theme");

    return () => {
      document.body.classList.remove("team-theme");
      document.documentElement.classList.remove("theme-transition");
      if (themeTransitionTimerRef.current) window.clearTimeout(themeTransitionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem("clickme-theme");
    const themePreference: ThemePreference =
      savedTheme === "light" ||
      savedTheme === "dark" ||
      savedTheme === "system"
        ? savedTheme
        : "dark";

    function applyTheme(preference: ThemePreference) {
      const resolvedTheme =
        preference === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : preference;

      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(resolvedTheme);
    }

    applyTheme(themePreference);

    const timer = window.setTimeout(() => {
      setTheme(themePreference);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (theme !== "system") {
      return;
    }

    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");

    function handleSystemThemeChange() {
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(
        colorScheme.matches ? "dark" : "light",
      );
    }

    colorScheme.addEventListener("change", handleSystemThemeChange);
    return () => {
      colorScheme.removeEventListener("change", handleSystemThemeChange);
    };
  }, [theme]);

  function selectTheme(nextTheme: ThemePreference) {
    const resolvedTheme =
      nextTheme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : nextTheme;

    const root = document.documentElement;
    const shouldAnimate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (themeTransitionTimerRef.current) window.clearTimeout(themeTransitionTimerRef.current);
    if (shouldAnimate) root.classList.add("theme-transition");

    setTheme(nextTheme);
    setThemeMenuOpen(false);
    localStorage.setItem("clickme-theme", nextTheme);
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);

    if (shouldAnimate) {
      themeTransitionTimerRef.current = window.setTimeout(() => {
        root.classList.remove("theme-transition");
        themeTransitionTimerRef.current = null;
      }, 340);
    }
  }

  const loadProjects = useCallback(async () => {
    const response = await fetch("/api/projects", { cache: "no-store" });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as {
      workspaces?: Workspace[];
      projects?: Project[];
    };

    const loadedWorkspaces = data.workspaces ?? [];

    setWorkspaces(
      loadedWorkspaces.map((workspace) => ({
        ...workspace,
        projects: sortProjects(workspace.projects),
      })),
    );

    if (loadedWorkspaces.length) {
      const projectSlugMatch = pathname.match(/^\/team\/projects\/([^/]+)/);
      const workspaceSlugMatch = pathname.match(/^\/team\/workspaces\/([^/]+)/);
      const activeProjectSlug = projectSlugMatch
        ? decodeURIComponent(projectSlugMatch[1])
        : "";
      const routeWorkspace = loadedWorkspaces.find((workspace) =>
        workspace.projects.some((project) => project.slug === activeProjectSlug) ||
        workspace.slug === (workspaceSlugMatch ? decodeURIComponent(workspaceSlugMatch[1]) : ""),
      );
      const initialWorkspace = routeWorkspace ?? loadedWorkspaces[0];

      setActiveWorkspaceId(initialWorkspace.id);
      setExpandedWorkspaceIds(routeWorkspace ? [routeWorkspace.id] : []);
    } else {
      setActiveWorkspaceId(0);
      setExpandedWorkspaceIds([]);
    }
  }, [pathname]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadProjects().catch(() => undefined);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadProjects]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      if (!target.closest("[data-sidebar-popup]")) {
        setProjectsOpen(false);
        setOpenWorkspaceMenuId(null);
        setOpenProjectMenuId(null);
        setThemeMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!createWorkspaceOpen) {
      createWorkspaceButtonRef.current?.blur();
    }
  }, [createWorkspaceOpen]);

  useEffect(() => {
    if (!projectsOpen) {
      projectsMenuButtonRef.current?.blur();
    }
  }, [projectsOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (document.querySelector("dialog[data-sheet-settings-dialog][open]")) return;
      if (event.key === "Escape" || event.key === "Esc") {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }

        setCreateWorkspaceOpen(false);
        setImportRequestsOpen(false);
        setCreateProjectOpen(false);
        setManageWorkspaceOpen(false);
        setManageProjectOpen(false);
        setAddWorkspaceMemberOpen(false);
        setAddProjectMemberOpen(false);
        setProjectsOpen(false);
        setOpenWorkspaceMenuId(null);
        setOpenProjectMenuId(null);
        setOpenMemberProjectsId(null);
        setThemeMenuOpen(false);

        window.requestAnimationFrame(() => {
          if (
            document.activeElement instanceof HTMLElement &&
            document.activeElement !== document.body
          ) {
            document.activeElement.blur();
          }
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  useEffect(() => {
    if (!addWorkspaceMemberOpen || memberEmail.trim().length < 2) {
      return;
    }

    const searchController = new AbortController();
    const timer = window.setTimeout(() => {
      setLoadingUserOptions(true);

      fetch(`/api/users?q=${encodeURIComponent(memberEmail)}`, {
        signal: searchController.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { users?: UserOption[] } | null) => {
          if (searchController.signal.aborted) return;
          const existingMemberIds = new Set(
            workspaceMembers.map((member) => member.id),
          );
          setUserOptions(
            (data?.users ?? []).filter((user) => !existingMemberIds.has(user.id)),
          );
        })
        .catch(() => {
          if (!searchController.signal.aborted) {
            setUserOptions([]);
          }
        })
        .finally(() => {
          if (!searchController.signal.aborted) {
            setLoadingUserOptions(false);
          }
        });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      searchController.abort();
    };
  }, [addWorkspaceMemberOpen, memberEmail, workspaceMembers]);

  useEffect(() => {
    if (!addProjectMemberOpen) {
      return;
    }

    const searchController = new AbortController();
    const timer = window.setTimeout(() => {
      setLoadingProjectUserOptions(true);

      fetch(`/api/users?q=${encodeURIComponent(projectMemberSearch)}`, {
        signal: searchController.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { users?: UserOption[] } | null) => {
          const existingMemberIds = new Set(
            projectMembers.map((member) => member.id),
          );
          setProjectUserOptions(
            (data?.users ?? []).filter((user) => !existingMemberIds.has(user.id)),
          );
        })
        .catch(() => {
          if (!searchController.signal.aborted) {
            setProjectUserOptions([]);
          }
        })
        .finally(() => {
          if (!searchController.signal.aborted) {
            setLoadingProjectUserOptions(false);
          }
        });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      searchController.abort();
    };
  }, [addProjectMemberOpen, projectMemberSearch, projectMembers]);

  function openCreateProject(workspaceId = activeWorkspaceId) {
    setProjectsOpen(false);
    setOpenWorkspaceMenuId(null);

    if (!workspaceId) {
      setCreateWorkspaceOpen(true);
      return;
    }

    setActiveWorkspaceId(workspaceId);
    setCreateProjectError("");
    setCreateProjectOpen(true);
  }

  function openCreateWorkspace() {
    setProjectsOpen(false);
    setOpenWorkspaceMenuId(null);
    setCreateWorkspaceError("");
    setCreateWorkspaceOpen(true);
  }

  async function loadWorkspaceMembers(workspaceId: number) {
    setLoadingWorkspaceMembers(true);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`);

      if (!response.ok) {
        setWorkspaceMembers([]);
        setCanManageWorkspaceMembers(false);
        return;
      }

      const data = (await response.json()) as {
        members?: WorkspaceMember[];
        invitations?: {id: number; email: string; role: string}[];
        canManage?: boolean;
      };

      setWorkspaceMembers(data.members ?? []);
      setPendingInvitations(data.invitations ?? []);
      setCanManageWorkspaceMembers(Boolean(data.canManage));
    } finally {
      setLoadingWorkspaceMembers(false);
    }
  }

  function openManageWorkspace(workspace: Workspace) {
    setProjectsOpen(false);
    setOpenWorkspaceMenuId(null);
    setManagedWorkspace(workspace);
    setMemberNotice("");
    setPendingInvitations([]);
    setManageWorkspaceTab("workspace");
    setManagedWorkspaceName(workspace.name);
    setManagedWorkspaceDescription(workspace.description ?? "");
    setManagedWorkspacePublished(workspace.isPublished);
    setWorkspaceDetailsError("");
    setMemberError("");
    setMemberEmail("");
    setSelectedMember(null);
    setUserOptions([]);
    setMemberRole("collaborator");
    setMemberProjectIds([]);
    setMemberProjectSearch("");
    setAddWorkspaceMemberOpen(false);
    setCanManageWorkspaceMembers(false);
    setManageWorkspaceOpen(true);
    void loadWorkspaceMembers(workspace.id);
  }

  async function handleSaveWorkspaceDetails(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setWorkspaceDetailsError("");

    const name = managedWorkspaceName.trim();

    if (!managedWorkspace || !name || !canManageWorkspaceMembers) {
      if (!name) {
        setWorkspaceDetailsError("Workspace name wajib diisi.");
      }
      return;
    }

    setSavingWorkspaceDetails(true);

    try {
      const response = await fetch(`/api/workspaces/${managedWorkspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: managedWorkspaceDescription.trim(),
          isPublished: managedWorkspacePublished,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        workspace?: Pick<
          Workspace,
          "id" | "name" | "description" | "slug" | "isPublished"
        >;
      };

      if (!response.ok || !data.workspace) {
        setWorkspaceDetailsError(
          data.error ?? "Gagal menyimpan workspace.",
        );
        return;
      }

      const updatedWorkspace = data.workspace;
      setWorkspaces((currentWorkspaces) =>
        currentWorkspaces.map((workspace) =>
          workspace.id === updatedWorkspace.id
            ? {
                ...workspace,
                name: updatedWorkspace.name,
                description: updatedWorkspace.description,
                isPublished: updatedWorkspace.isPublished,
              }
            : workspace,
        ),
      );
      setManagedWorkspace((workspace) =>
        workspace
          ? {
              ...workspace,
              name: updatedWorkspace.name,
              description: updatedWorkspace.description,
              isPublished: updatedWorkspace.isPublished,
            }
          : workspace,
      );
      setManagedWorkspaceName(updatedWorkspace.name);
      setManagedWorkspaceDescription(updatedWorkspace.description);
      setManagedWorkspacePublished(updatedWorkspace.isPublished);
    } catch {
      setWorkspaceDetailsError("Gagal terhubung ke server.");
    } finally {
      setSavingWorkspaceDetails(false);
    }
  }

  async function handleAddWorkspaceMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMemberError("");

    if (!managedWorkspace) {
      return;
    }

    const email = (selectedMember?.email ?? memberEmail).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMemberError("Pilih hasil pencarian atau masukkan email lengkap.");
      return;
    }

    setAddingWorkspaceMember(true);

    try {
      const response = await fetch(
        `/api/workspaces/${managedWorkspace.id}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            role: memberRole,
            projectIds: memberProjectIds,
          }),
        },
      );

      const data = (await response.json()) as { error?: string; emailNotificationSent?: boolean };

      if (!response.ok) {
        setMemberError(data.error ?? "Gagal membuat undangan.");
        return;
      }

      setMemberEmail("");
      setSelectedMember(null);
      setUserOptions([]);
      setMemberRole("collaborator");
      setMemberProjectIds([]);
      setMemberProjectSearch("");
      setAddWorkspaceMemberOpen(false);
      setMemberNotice(data.emailNotificationSent
        ? "Undangan dikirim melalui email dan tersedia di menu Messages. Akses diberikan setelah undangan diterima."
        : "Undangan tersedia di menu Messages, tetapi email belum dapat dikirim.");
      await loadWorkspaceMembers(managedWorkspace.id);
    } catch {
      setMemberError("Gagal terhubung ke server.");
    } finally {
      setAddingWorkspaceMember(false);
    }
  }

  async function deleteWorkspaceMember(member: WorkspaceMember) {
    if (!managedWorkspace) throw new Error("Workspace tidak tersedia.");
    setDeletingMember(member.id);
    setMemberError("");
    try {
      const response = await fetch(`/api/workspaces/${managedWorkspace.id}/members`, {
        method: "DELETE", headers: {"Content-Type": "application/json"}, body: JSON.stringify({userId: member.id}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Gagal menghapus anggota.");
      await loadWorkspaceMembers(managedWorkspace.id);
      await loadProjects();
    } finally { setDeletingMember(null); }
  }

  useEffect(() => {
    const refresh = () => { void loadProjects(); };
    window.addEventListener("workspace-membership-changed", refresh);
    window.addEventListener("clickme-projects-updated", refresh);
    return () => {
      window.removeEventListener("workspace-membership-changed", refresh);
      window.removeEventListener("clickme-projects-updated", refresh);
    };
  }, [loadProjects]);

  async function archiveWorkspace(workspace: Workspace) {
    setOpenWorkspaceMenuId(null);
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/archive`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: !workspace.isArchived }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setWorkspaces(current => current.map(item => item.id === workspace.id ? { ...item, isArchived: data.isArchived } : item));
      setWorkspacePinError("");
    } catch (error) { setWorkspacePinError(error instanceof Error ? error.message : "Gagal mengarsipkan workspace."); }
  }

  async function updateWorkspaceMember(
    member: WorkspaceMember,
    updates: Partial<Pick<WorkspaceMember, "role" | "projects">>,
  ) {
    if (!managedWorkspace || member.isOwner) {
      return;
    }

    const nextMember = {
      ...member,
      ...updates,
    };

    setWorkspaceMembers((currentMembers) =>
      currentMembers.map((currentMember) =>
        currentMember.id === member.id ? nextMember : currentMember,
      ),
    );

    const response = await fetch(
      `/api/workspaces/${managedWorkspace.id}/members`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: member.id,
          role: nextMember.role,
          projectIds: nextMember.projects.map((project) => project.id),
        }),
      },
    );

    if (!response.ok) {
      await loadWorkspaceMembers(managedWorkspace.id);
    }
  }

  function moveWorkspaceMemberToRole(
    role: (typeof workspaceRoles)[number],
  ) {
    const member = workspaceMembers.find(
      (workspaceMember) => workspaceMember.id === draggedWorkspaceMemberId,
    );

    setDraggedWorkspaceMemberId(null);
    setWorkspaceRoleDropTarget(null);

    if (!member || member.isOwner || member.role === role) {
      return;
    }

    void updateWorkspaceMember(member, { role });
  }

  async function loadProjectMembers(projectId: number) {
    setLoadingProjectMembers(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/members`);

      if (!response.ok) {
        setProjectMembers([]);
        return;
      }

      const data = (await response.json()) as {
        members?: ProjectMember[];
      };

      setProjectMembers(data.members ?? []);
    } finally {
      setLoadingProjectMembers(false);
    }
  }

  function openManageProject(project: Project) {
    setProjectsOpen(false);
    setOpenWorkspaceMenuId(null);
    setOpenProjectMenuId(null);
    setManagedProject(project);
    setManageProjectTab("project");
    setManagedProjectName(project.name);
    setManagedProjectDescription(project.description ?? "");
    setManagedProjectPublishMode(project.publishMode ?? "inherit");
    setProjectDetailsError("");
    setProjectMemberError("");
    setProjectMemberSearch("");
    setSelectedProjectMember(null);
    setProjectUserOptions([]);
    setProjectMemberPermission("Manage");
    setAddProjectMemberOpen(false);
    setManageProjectOpen(true);
    void loadProjectMembers(project.id);
  }

  async function handleSaveProjectDetails(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setProjectDetailsError("");

    const name = managedProjectName.trim();

    if (!managedProject || !name || managedProject.permission !== "Full akses") {
      if (!name) {
        setProjectDetailsError("Project name wajib diisi.");
      }
      return;
    }

    setSavingProjectDetails(true);

    try {
      const response = await fetch(`/api/projects/${managedProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: managedProjectDescription.trim(),
          publishMode: managedProjectPublishMode,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        project?: Pick<Project, "id" | "name" | "description" | "publishMode">;
      };

      if (!response.ok || !data.project) {
        setProjectDetailsError(data.error ?? "Gagal menyimpan project.");
        return;
      }

      const updatedProject = data.project;
      setWorkspaces((currentWorkspaces) =>
        currentWorkspaces.map((workspace) => ({
          ...workspace,
          projects: workspace.projects.map((project) =>
            project.id === updatedProject.id
              ? { ...project, ...updatedProject }
              : project,
          ),
        })),
      );
      setManagedProject((project) =>
        project ? { ...project, ...updatedProject } : project,
      );
      setManagedProjectName(updatedProject.name);
      setManagedProjectDescription(updatedProject.description);
      setManagedProjectPublishMode(updatedProject.publishMode);
    } catch {
      setProjectDetailsError("Gagal terhubung ke server.");
    } finally {
      setSavingProjectDetails(false);
    }
  }

  async function handleAddProjectMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectMemberError("");

    if (!managedProject) {
      return;
    }

    if (!selectedProjectMember) {
      setProjectMemberError("Pilih user dari daftar terlebih dahulu.");
      return;
    }

    setAddingProjectMember(true);

    try {
      const response = await fetch(`/api/projects/${managedProject.id}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: selectedProjectMember.email,
          permission: projectMemberPermission,
        }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setProjectMemberError(data.error ?? "Gagal menambahkan member.");
        return;
      }

      setProjectMemberSearch("");
      setSelectedProjectMember(null);
      setProjectUserOptions([]);
      setProjectMemberPermission("Manage");
      setAddProjectMemberOpen(false);
      await loadProjectMembers(managedProject.id);
    } catch {
      setProjectMemberError("Gagal terhubung ke server.");
    } finally {
      setAddingProjectMember(false);
    }
  }

  async function updateProjectMemberPermission(
    member: ProjectMember,
    permission: ProjectMember["permission"],
  ) {
    if (!managedProject) {
      return;
    }

    setProjectMembers((currentMembers) =>
      currentMembers.map((currentMember) =>
        currentMember.id === member.id
          ? { ...currentMember, permission }
          : currentMember,
      ),
    );

    const response = await fetch(`/api/projects/${managedProject.id}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: member.email,
        permission,
      }),
    });

    if (!response.ok) {
      await loadProjectMembers(managedProject.id);
    }
  }

  function moveProjectMemberToPermission(
    permission: ProjectMember["permission"],
  ) {
    const member = projectMembers.find(
      (projectMember) => projectMember.id === draggedProjectMemberId,
    );

    setDraggedProjectMemberId(null);
    setProjectPermissionDropTarget(null);

    if (!member || member.permission === permission) {
      return;
    }

    void updateProjectMemberPermission(member, permission);
  }

  function getSelectedProjects(projectIds: number[]) {
    return (
      managedWorkspace?.projects.filter((project) =>
        projectIds.includes(project.id),
      ) ?? []
    );
  }

  function getProjectOptions(search: string, selectedProjectIds: number[]) {
    const normalizedSearch = search.trim().toLowerCase();

    return (
      managedWorkspace?.projects.filter((project) => {
        const alreadySelected = selectedProjectIds.includes(project.id);
        const matchesSearch =
          !normalizedSearch ||
          project.name.toLowerCase().includes(normalizedSearch);

        return !alreadySelected && matchesSearch;
      }) ?? []
    );
  }

  useEffect(() => {
    const open = (event: Event) => openCreateProject((event as CustomEvent<number>).detail);
    window.addEventListener("clickme-create-project", open);
    return () => window.removeEventListener("clickme-create-project", open);
  });

  useEffect(() => {
    const open = () => openCreateWorkspace();
    window.addEventListener("clickme-create-workspace", open);
    return () => window.removeEventListener("clickme-create-workspace", open);
  });

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateProjectError("");

    if (!projectName.trim()) {
      setCreateProjectError("Project name wajib diisi.");
      return;
    }

    if (!activeWorkspaceId) {
      setCreateProjectError("Buat workspace dulu sebelum membuat project.");
      return;
    }

    setCreatingProject(true);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          description: projectDescription,
          workspaceId: activeWorkspaceId,
        }),
      });

      const data = (await response.json()) as {
        project?: Project;
        error?: string;
      };

      if (!response.ok || !data.project) {
        setCreateProjectError(data.error ?? "Gagal membuat project.");
        return;
      }

      setWorkspaces((currentWorkspaces) =>
        currentWorkspaces.map((workspace) =>
          workspace.id === activeWorkspaceId
            ? {
                ...workspace,
                projects: sortProjects([...workspace.projects, data.project!]),
              }
            : workspace,
        ),
      );
      setProjectName("");
      setProjectDescription("");
      setCreateProjectOpen(false);
      setExpandedWorkspaceIds([activeWorkspaceId]);
    } catch {
      setCreateProjectError("Gagal terhubung ke server.");
    } finally {
      setCreatingProject(false);
    }
  }

  async function handleCreateWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateWorkspaceError("");

    if (!workspaceName.trim()) {
      setCreateWorkspaceError("Workspace name wajib diisi.");
      return;
    }

    setCreatingWorkspace(true);

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: workspaceName,
          description: workspaceDescription,
        }),
      });

      const data = (await response.json()) as {
        workspace?: Workspace;
        error?: string;
      };

      if (!response.ok || !data.workspace) {
        setCreateWorkspaceError(data.error ?? "Gagal membuat workspace.");
        return;
      }

      setWorkspaces((currentWorkspaces) => [...currentWorkspaces, data.workspace!]);
      setActiveWorkspaceId(data.workspace.id);
      setExpandedWorkspaceIds((currentIds) => [...currentIds, data.workspace!.id]);
      setWorkspaceName("");
      setWorkspaceDescription("");
      setCreateWorkspaceOpen(false);
    } catch {
      setCreateWorkspaceError("Gagal terhubung ke server.");
    } finally {
      setCreatingWorkspace(false);
    }
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      setImportCsv(await file.text());
      setImportFileName(file.name);
      setImportSheetUrl("");
      setImportError("");
      setImportResult(null);
    } catch {
      setImportError("File tidak dapat dibaca.");
    }
  }

  async function handleImportRequests(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setImportError("");
    setImportResult(null);
    setImportMonitoringLinks([]);
    setCopiedMonitoringTaskId(null);

    if (!importSheetUrl.trim() && !importCsv.trim()) {
      setImportError("Masukkan link Google Sheet atau unggah file CSV/TSV.");
      return;
    }

    setImporting(true);

    try {
      const response = await fetch("/api/imports/data-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          googleSheetUrl: importSheetUrl.trim() || undefined,
          csv: importCsv || undefined,
          workspaceName: importWorkspaceName.trim() || "Permintaan Data",
        }),
      });
      const responseText = await response.text();
      const data = (responseText ? JSON.parse(responseText) : {}) as {
        error?: string;
        workspace?: {
          id: number;
          name: string;
          slug: string;
        };
        summary?: {
          rows: number;
          created: number;
          updated: number;
          skipped: number;
          skippedRows?: Array<{ row: number; reason: string }>;
          projectsCreated: number;
        };
        monitoringLinks?: DataRequestMonitoringLink[];
      };

      if (!response.ok || !data.workspace || !data.summary) {
        setImportError(data.error ?? "Impor permintaan data gagal.");
        return;
      }

      setImportResult(data.summary);
      setImportMonitoringLinks(data.monitoringLinks ?? []);

      const projectsResponse = await fetch("/api/projects");
      if (projectsResponse.ok) {
        const projectsData = (await projectsResponse.json()) as {
          workspaces?: Workspace[];
        };
        const loadedWorkspaces = (projectsData.workspaces ?? []).map(
          (workspace) => ({
            ...workspace,
            projects: sortProjects(workspace.projects),
          }),
        );

        setWorkspaces(loadedWorkspaces);
        setActiveWorkspaceId(data.workspace.id);
        setExpandedWorkspaceIds([data.workspace.id]);
      }

      setImportCsv("");
      setImportFileName("");
      if (importCsvInputRef.current) {
        importCsvInputRef.current.value = "";
      }
    } catch {
      setImportError("Gagal membaca respons server. Coba impor kembali.");
    } finally {
      setImporting(false);
    }
  }

  async function toggleProjectPin(projectId: number, isPinned: boolean) {
    if (pinRequestsRef.current.has(projectId)) return;
    pinRequestsRef.current.add(projectId);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const [id, row] of projectRowsRef.current) pinPositionsRef.current.set(id, row.getBoundingClientRect().top);
      const row = projectRowsRef.current.get(projectId);
      row?.animate([{ boxShadow: "inset 0 0 0 1px rgba(167,139,250,.65)" }, { boxShadow: "inset 0 0 0 1px transparent" }], { duration: 650, easing: "ease-out" });
      row?.querySelector("[data-pin-icon]")?.animate([
        { transform: "scale(1) rotate(0deg)" },
        { transform: `scale(1.35) rotate(${isPinned ? -18 : 18}deg)`, offset: 0.4 },
        { transform: "scale(1) rotate(0deg)" },
      ], { duration: 380, easing: "ease-out" });
    }

    setWorkspaces((currentWorkspaces) =>
      currentWorkspaces.map((workspace) => ({
        ...workspace,
        projects: sortProjects(
          workspace.projects.map((project) =>
            project.id === projectId ? { ...project, isPinned } : project,
          ),
        ),
      })),
    );

    try {
      const response = await fetch(`/api/projects/${projectId}/pin`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isPinned }),
      });

      if (!response.ok) {
        throw new Error("Failed to pin project");
      }
    } catch {
      setWorkspaces((currentWorkspaces) =>
        currentWorkspaces.map((workspace) => ({
          ...workspace,
          projects: sortProjects(
            workspace.projects.map((project) =>
              project.id === projectId
                ? { ...project, isPinned: !isPinned }
                : project,
            ),
          ),
        })),
      );
    } finally {
      pinRequestsRef.current.delete(projectId);
    }
  }

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
    workspaces[0];
  const managedProjectWorkspace = workspaces.find((workspace) =>
    workspace.projects.some((project) => project.id === managedProject?.id),
  );
  const managedProjectPublished =
    managedProjectPublishMode === "published" ||
    (managedProjectPublishMode === "inherit" &&
      Boolean(managedProjectWorkspace?.isPublished));

  return (
    <div className="team-theme h-screen overflow-hidden bg-[#0f0f10] text-[#f4f4f5]">
      <MessageToastWatcher />
      {workspaceToDelete ? <RemoveMemberDialog kind="workspace"
        member={{name: workspaceToDelete.name, email: `${workspaceToDelete.projects.length} project`}}
        workspaceName={workspaceToDelete.name}
        onClose={() => setWorkspaceToDelete(null)}
        onConfirm={async () => {
          const response = await fetch(`/api/workspaces/${workspaceToDelete.id}`, {method: "DELETE"});
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Workspace gagal dihapus.");
          setWorkspaces(current => current.filter(item => item.id !== workspaceToDelete.id));
          if (managedWorkspace?.id === workspaceToDelete.id) setManagedWorkspace(null);
          if (workspaceToDelete.projects.some(project => pathname?.includes(`/projects/${project.slug}`))) window.location.assign('/team');
        }}
      /> : null}
      {projectToDelete ? <RemoveMemberDialog kind="project"
        member={{name: projectToDelete.name, email: "Project dan seluruh task"}}
        workspaceName={projectToDelete.name}
        onClose={() => setProjectToDelete(null)}
        onConfirm={async () => {
          const response = await fetch(`/api/projects/${projectToDelete.id}`, {method: "DELETE"});
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Project gagal dihapus.");
          setWorkspaces(current => current.map(workspace => ({...workspace, projects: workspace.projects.filter(project => project.id !== projectToDelete.id)})));
          if (managedProject?.id === projectToDelete.id) setManageProjectOpen(false);
          if (pathname?.includes(`/projects/${projectToDelete.slug}`)) window.location.assign('/team');
        }}
      /> : null}
      {projectMemberToDelete && managedProject ? <RemoveMemberDialog
        member={projectMemberToDelete}
        workspaceName={`project ${managedProject.name}`}
        onClose={() => setProjectMemberToDelete(null)}
        onConfirm={async () => {
          const response = await fetch(`/api/projects/${managedProject.id}/members`, {method: "DELETE", headers: {"Content-Type": "application/json"}, body: JSON.stringify({userId: projectMemberToDelete.id})});
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Anggota project gagal dihapus.");
          await loadProjectMembers(managedProject.id);
        }}
      /> : null}
      {memberToDelete && managedWorkspace ? <RemoveMemberDialog
        member={memberToDelete}
        workspaceName={managedWorkspace.name}
        onClose={() => setMemberToDelete(null)}
        onConfirm={() => deleteWorkspaceMember(memberToDelete)}
      /> : null}
      <div className="flex h-screen overflow-hidden">
        <aside className="team-sidebar relative z-[100] flex h-screen w-[260px] shrink-0 flex-col overflow-visible border-r border-white/10 bg-[#171717]">
          <nav className="min-h-0 flex-1 overflow-visible px-4 py-5">
            <section>
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] font-semibold transition hover:bg-white/10 hover:text-white ${profileOpen ? "bg-white/10 text-white" : "text-white/80"}`}
                aria-expanded={profileOpen}
              >
                <span className="flex items-center gap-3">
                  <UserCircleIcon className="size-4.5 text-white/60" />
                  Profile
                </span>
                <ChevronDownIcon
                  className={`size-3.5 text-white/45 transition-transform duration-200 ease-out ${
                    profileOpen ? "rotate-180" : "rotate-0"
                  }`}
                />
              </button>

              <div
                className={`grid transition-[grid-template-rows,opacity,transform] duration-200 ease-out ${
                  profileOpen
                    ? "grid-rows-[1fr] opacity-100 translate-y-0"
                    : "grid-rows-[0fr] opacity-0 -translate-y-1"
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="mt-0.5 space-y-0.5 pl-8">
                  <Link
                    href="/team/profile"
                    onClick={() => setProfileOpen(false)}
                    tabIndex={profileOpen ? 0 : -1}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1 text-[13px] text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    <UserIcon className="size-3.5" />
                    My Profile
                  </Link>
                  <Link
                    href="/team/assigned"
                    onClick={() => setProfileOpen(false)}
                    tabIndex={profileOpen ? 0 : -1}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1 text-[13px] text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    <UsersIcon className="size-3.5" />
                    My Assigned
                  </Link>
                  <Link href="/team/invitations" onClick={() => setProfileOpen(false)} tabIndex={profileOpen ? 0 : -1} className="flex items-center gap-2 rounded-md px-2.5 py-1 text-[13px] text-white/60 transition hover:bg-white/10 hover:text-white">
                    <EnvelopeIcon className="size-3.5" />Messages
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      void fetch("/api/logout", { method: "POST" }).finally(() =>
                        window.location.assign("/login"),
                      );
                    }}
                    tabIndex={profileOpen ? 0 : -1}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-[13px] text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    <ArrowRightStartOnRectangleIcon className="size-3.5" />
                    Log out
                  </button>
                  </div>
                </div>
              </div>
            </section>

            <section ref={projectsMenuRef} className="relative mt-4">
              <div className="mb-0.5 flex items-center justify-between">
                <Link href="/team/workspaces" onClick={() => setProfileOpen(false)} className="rounded px-1 py-1 text-[15px] font-semibold text-white/75 transition hover:text-white">
                  Workspaces
                </Link>
                <div className="flex items-center gap-1.5">
                  <WorkspaceSortMenu value={workspaceSort} onChange={setWorkspaceSort} />
                  <button
                    ref={projectsMenuButtonRef}
                    data-sidebar-popup
                    type="button"
                    onClick={() => {
                      if (!activeWorkspace) {
                        return;
                      }

                      setActiveWorkspaceId(activeWorkspace.id);
                      setOpenWorkspaceMenuId(null);
                      setProjectsOpen((open) => !open);
                    }}
                    disabled={!activeWorkspace}
                    className="sidebar-action-button sidebar-menu-button flex size-6 items-center justify-center rounded bg-white/10 text-white transition hover:bg-white/15"
                    aria-label="Open workspace menu"
                    aria-expanded={projectsOpen}
                  >
                    <EllipsisHorizontalIcon className="size-4" />
                  </button>
                  <button
                    ref={createWorkspaceButtonRef}
                    type="button"
                    onClick={openCreateWorkspace}
                    className="sidebar-action-button flex size-6 items-center justify-center rounded bg-white/10 text-white transition hover:bg-white/15"
                    aria-label="Create workspace"
                    aria-pressed={createWorkspaceOpen}
                  >
                    <PlusIcon className="size-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                {!workspaces.length ? (
                  <button
                    type="button"
                    onClick={openCreateWorkspace}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] text-white/40 transition hover:bg-white/10 hover:text-white/70"
                  >
                    <PlusIcon className="size-4 shrink-0" />
                    Create workspace
                  </button>
                ) : null}
                {workspacePinError ? <p role="alert" className="px-2 text-xs text-red-300">{workspacePinError}</p> : null}
                {workspaces.filter(workspace => showArchived || !workspace.isArchived).sort((a, b) => {
                  const pinned = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
                  if (pinned) return pinned;
                  if (workspaceSort === "default") return 0;
                  return a.name.localeCompare(b.name, "id", { numeric: true, sensitivity: "base" }) * (workspaceSort === "desc" ? -1 : 1);
                }).map((workspace) => {
                  const isExpanded = expandedWorkspaceIds.includes(workspace.id);
                  return (
                    <div key={workspace.id} ref={element => { if (element) workspaceRowsRef.current.set(workspace.id,element); else workspaceRowsRef.current.delete(workspace.id); }}>
                      <div
                        className={`group/workspace relative flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-white/70 transition hover:bg-white/10 hover:text-white ${openWorkspaceMenuId === workspace.id ? "z-40" : ""}`}
                      >
                        <Link
                          href={`/team/workspaces/${workspace.slug}`}
                          onClick={() => {
                            setProfileOpen(false);
                            setActiveWorkspaceId(workspace.id);
                            setExpandedWorkspaceIds([workspace.id]);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-normal"
                        >
                          <span className="workspace-avatar flex size-6 shrink-0 items-center justify-center rounded-md bg-white text-sm font-bold text-[#0f0f10]">
                            {workspace.name[0]?.toUpperCase()}
                          </span>
                          <span className="truncate">{workspace.name}{workspace.isArchived ? " (Archived)" : ""}</span>
                        </Link>
                        <button type="button" aria-label={workspace.isPinned ? "Unpin workspace" : "Pin workspace"} aria-pressed={Boolean(workspace.isPinned)} title={workspace.isPinned ? "Unpin workspace" : "Pin workspace"} onClick={() => toggleWorkspacePin(workspace.id,!workspace.isPinned)} className={`flex size-5 shrink-0 items-center justify-center rounded transition hover:bg-white/10 focus-visible:text-white ${workspace.isPinned ? "text-white" : "text-white/0 group-hover/workspace:text-white/55"}`}><Pin data-workspace-pin className={`size-3.5 ${workspace.isPinned ? "fill-current" : ""}`} /></button>
                        <div className="relative shrink-0">
                          <button
                            data-sidebar-popup
                            type="button"
                          onClick={() => {
                            setProfileOpen(false);
                            setActiveWorkspaceId(workspace.id);
                            setProjectsOpen(false);
                            setOpenProjectMenuId(null);
                            setOpenWorkspaceMenuId((currentId) =>
                              currentId === workspace.id ? null : workspace.id,
                            );
                          }}
                            className={`workspace-row-menu-button flex size-5 items-center justify-center rounded transition hover:bg-white/10 hover:text-white ${
                              openWorkspaceMenuId === workspace.id
                                ? "bg-white/10 text-white"
                                : "text-white/0 group-hover/workspace:text-white/55"
                            }`}
                            aria-label="Workspace menu"
                            aria-expanded={openWorkspaceMenuId === workspace.id}
                          >
                            <EllipsisHorizontalIcon className="size-3.5" />
                          </button>
                          <div
                            data-sidebar-popup
                            className={`absolute left-0 top-6 z-[70] w-48 overflow-hidden rounded-lg border border-white/10 bg-[#191919] py-1.5 shadow-[0_14px_36px_rgba(0,0,0,0.45)] transition duration-150 ease-out ${
                              openWorkspaceMenuId === workspace.id
                                ? "pointer-events-auto translate-x-0 opacity-100"
                                : "pointer-events-none -translate-x-1 opacity-0"
                            }`}
                            aria-hidden={openWorkspaceMenuId !== workspace.id}
                          >
                            <button
                              type="button"
                              tabIndex={openWorkspaceMenuId === workspace.id ? 0 : -1}
                              onClick={() => openCreateProject(workspace.id)}
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-white/80 hover:bg-white/10 hover:text-white"
                            >
                              <PlusIcon className="size-4 text-white/45" />
                              Create Project
                            </button>
                            <button
                              type="button"
                              tabIndex={openWorkspaceMenuId === workspace.id ? 0 : -1}
                              onClick={() => openManageWorkspace(workspace)}
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-white/80 hover:bg-white/10 hover:text-white"
                            >
                              <Cog6ToothIcon className="size-4 text-white/45" />
                              Manage workspace
                            </button>
                            <button type="button" tabIndex={openWorkspaceMenuId === workspace.id ? 0 : -1} onClick={() => void archiveWorkspace(workspace)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-white/80 hover:bg-white/10">
                              <ArchiveBoxIcon className="size-4" />
                              {workspace.isArchived ? "Restore workspace" : "Archive workspace"}
                            </button>
                            <button
                              type="button"
                              tabIndex={openWorkspaceMenuId === workspace.id ? 0 : -1}
                              onClick={() => { setOpenWorkspaceMenuId(null); setWorkspaceToDelete(workspace); }}
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-red-300 hover:bg-red-500/10 hover:text-red-200"
                            >
                              <TrashIcon className="size-4 text-red-300/70" />
                              Delete
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openCreateProject(workspace.id)}
                          className="flex size-5 shrink-0 items-center justify-center rounded text-white/0 transition hover:bg-white/10 hover:text-white group-hover/workspace:text-white/55 focus-visible:text-white"
                          aria-label="Create project in workspace"
                        >
                          <PlusIcon className="size-3.5" />
                        </button>
                      </div>

                      <div
                        className={`grid transition-[grid-template-rows,opacity,transform] duration-200 ease-out ${
                          isExpanded
                            ? "grid-rows-[1fr] opacity-100 translate-y-0"
                            : "grid-rows-[0fr] opacity-0 -translate-y-1"
                        }`}
                      >
                        <div
                          className={`min-h-0 ${
                            isExpanded ? "overflow-visible" : "overflow-hidden"
                          }`}
                        >
                          <div className="mt-1 space-y-0.5 pl-8">
                            {workspace.projects.map((project, projectIndex) => (
                              <div
                                key={project.id}
                                ref={(element) => { if (element) projectRowsRef.current.set(project.id, element); else projectRowsRef.current.delete(project.id); }}
                                style={{
                                  transitionDelay: isExpanded
                                    ? `${Math.min(projectIndex * 30, 150)}ms`
                                    : "0ms",
                                }}
                                className={`group/project relative flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-white/60 transition-[opacity,transform,background-color,color] duration-200 hover:bg-white/10 hover:text-white ${
                                  openProjectMenuId === project.id ? "z-40" : ""
                                } ${
                                  isExpanded
                                    ? "translate-y-0 opacity-100"
                                    : "-translate-y-2 opacity-0"
                                }`}
                              >
                                <Link
                                  href={`/team/projects/${project.slug}/v/l/${project.viewSlug}`}
                                  tabIndex={isExpanded ? 0 : -1}
                                  onClick={() => {
                                    setProfileOpen(false);
                                    setActiveWorkspaceId(workspace.id);
                                    setExpandedWorkspaceIds([workspace.id]);
                                    setProjectsOpen(false);
                                    setOpenWorkspaceMenuId(null);
                                    setOpenProjectMenuId(null);
                                  }}
                                  className="flex min-w-0 flex-1 items-center gap-2"
                                >
                                  <span className="flex size-4.5 shrink-0 items-center justify-center rounded bg-white/10 text-[11px] font-semibold text-white/80">
                                    {project.name[0]}
                                  </span>
                                  <span className="min-w-0 truncate" title={project.name}>
                                    {project.name.length > 10
                                      ? `${project.name.slice(0, 10)}...`
                                      : project.name}
                                  </span>
                                </Link>
                                {project.isOwner || project.permission === "Full akses" ? (
                                  <button
                                    data-sidebar-popup
                                    type="button"
                                    tabIndex={isExpanded ? 0 : -1}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      setProjectsOpen(false);
                                      setOpenWorkspaceMenuId(null);
                                      setOpenProjectMenuId((currentId) =>
                                        currentId === project.id ? null : project.id,
                                      );
                                    }}
                                    className={`flex size-5 shrink-0 items-center justify-center rounded transition ${
                                      openProjectMenuId === project.id
                                        ? "bg-white/10 text-white"
                                        : "text-white/0 group-hover/project:text-white/45 hover:bg-white/10 hover:text-white"
                                    }`}
                                    aria-label="Project menu"
                                    aria-expanded={openProjectMenuId === project.id}
                                  >
                                    <EllipsisHorizontalIcon className="size-4" />
                                  </button>
                                ) : null}
                                <div
                                  data-sidebar-popup
                                  className={`absolute left-[calc(100%+0.35rem)] top-0 z-[70] w-36 overflow-hidden rounded-lg border border-white/10 bg-[#191919] py-1 shadow-[0_14px_36px_rgba(0,0,0,0.45)] transition duration-150 ease-out ${
                                    openProjectMenuId === project.id
                                      ? "pointer-events-auto translate-x-0 opacity-100"
                                      : "pointer-events-none -translate-x-1 opacity-0"
                                  }`}
                                  aria-hidden={openProjectMenuId !== project.id}
                                >
                                  <button
                                    type="button"
                                    tabIndex={openProjectMenuId === project.id ? 0 : -1}
                                    onClick={() => openManageProject(project)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium text-white/80 hover:bg-white/10 hover:text-white"
                                  >
                                    <Cog6ToothIcon className="size-4 text-white/45" />
                                    Setting
                                  </button>
                                  {project.isOwner ? <button
                                    type="button"
                                    tabIndex={openProjectMenuId === project.id ? 0 : -1}
                                    onClick={() => {
                                      setOpenProjectMenuId(null);
                                      setProjectToDelete(project);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium text-red-300 hover:bg-red-500/10 hover:text-red-200"
                                  >
                                    <TrashIcon className="size-4 text-red-300/70" />
                                    Delete
                                  </button> : null}
                                </div>
                                <button
                                  type="button"
                                  tabIndex={isExpanded ? 0 : -1}
                                  onClick={() =>
                                    toggleProjectPin(project.id, !project.isPinned)
                                  }
                                  className={`flex size-5 shrink-0 items-center justify-center rounded transition ${
                                    project.isPinned
                                      ? "text-white"
                                      : "text-white/0 group-hover/project:text-white/45 hover:text-white"
                                  }`}
                                  aria-label={
                                    project.isPinned ? "Unpin project" : "Pin project"
                                  }
                                  aria-pressed={project.isPinned}
                                >
                                  <Pin
                                    data-pin-icon
                                    className={`size-3.5 ${
                                      project.isPinned ? "fill-white" : ""
                                    }`}
                                  />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => openCreateProject(workspace.id)}
                              tabIndex={isExpanded ? 0 : -1}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] text-white/35 transition hover:bg-white/10 hover:text-white/70 focus-visible:text-white/70"
                            >
                              <PlusIcon className="size-4 shrink-0" />
                              Add project
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                data-sidebar-popup
                className={`absolute left-[calc(100%-3.25rem)] top-8 z-[80] w-[230px] origin-top-left overflow-hidden rounded-xl border border-white/10 bg-[#191919] shadow-[0_12px_30px_rgba(0,0,0,0.45)] transition duration-200 ease-out ${
                  projectsOpen
                    ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                    : "pointer-events-none -translate-y-2 scale-95 opacity-0"
                }`}
                aria-hidden={!projectsOpen}
                onKeyDownCapture={(event) => {
                  if (event.key === "Escape" || event.key === "Esc") {
                    event.preventDefault();
                    setProjectsOpen(false);
                  }
                }}
              >
                <div className="py-1">
                  <button
                    type="button"
                    onClick={openCreateWorkspace}
                    tabIndex={projectsOpen ? 0 : -1}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium text-white/85 hover:bg-white/10"
                  >
                    <PlusIcon className="size-3.5 text-white/55" />
                    <span>Create Workspace</span>
                  </button>
                </div>

                <div className="border-t border-white/10 py-1">
                  <ToggleRow
                    label="Show archived"
                    icon={<ArchiveBoxIcon className="size-3.5 text-white/55" />}
                    checked={showArchived}
                    tabIndex={projectsOpen ? 0 : -1}
                    onClick={() => setShowArchived((checked) => !checked)}
                  />
                </div>
              </div>
            </section>

            <FormsSidebar />

            <section className="mt-4" aria-label="Channels, coming soon">
              <h2 className="mb-0.5 text-[15px] font-semibold text-white/70">Channels</h2>
              <p className="px-2 py-1 text-[12px] font-medium text-white/35">Coming soon</p>
            </section>

            <section className="mt-4" aria-label="Direct messages, coming soon">
              <h2 className="mb-0.5 text-[15px] font-semibold text-white/70">Direct Messages</h2>
              <p className="px-2 py-1 text-[12px] font-medium text-white/35">Coming soon</p>
            </section>
          </nav>

          <div
            className="relative shrink-0 border-t border-white/10 p-3"
            data-sidebar-popup
          >
            <div
              className={`absolute bottom-full left-3 right-3 mb-2 origin-bottom overflow-hidden rounded-lg border border-white/10 bg-[#202020] p-1 shadow-[0_12px_35px_rgba(0,0,0,0.35)] transition duration-150 ${
                themeMenuOpen
                  ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                  : "pointer-events-none translate-y-1 scale-95 opacity-0"
              }`}
              aria-hidden={!themeMenuOpen}
            >
              {(
                [
                  { value: "dark", label: "Dark mode", icon: MoonIcon },
                  { value: "light", label: "Light mode", icon: SunIcon },
                  {
                    value: "system",
                    label: "System",
                    icon: ComputerDesktopIcon,
                  },
                ] as const
              ).map((option) => {
                const ThemeIcon = option.icon;
                const selected = theme === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectTheme(option.value)}
                    className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] transition ${
                      selected
                        ? "bg-white/10 font-semibold text-white"
                        : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    <ThemeIcon className="size-4 shrink-0" />
                    <span className="flex-1">{option.label}</span>
                    {selected ? (
                      <span className="size-1.5 rounded-full bg-emerald-400" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setThemeMenuOpen((open) => !open)}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px] font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Choose color theme"
              aria-haspopup="menu"
              aria-expanded={themeMenuOpen}
            >
              {theme === "light" ? (
                <SunIcon className="size-4 shrink-0" />
              ) : theme === "dark" ? (
                <MoonIcon className="size-4 shrink-0" />
              ) : (
                <ComputerDesktopIcon className="size-4 shrink-0" />
              )}
              <span className="flex-1">
                {theme === "light"
                  ? "Light mode"
                  : theme === "dark"
                    ? "Dark mode"
                    : "System"}
              </span>
              <ChevronDownIcon
                className={`size-3.5 transition-transform ${
                  themeMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
        </aside>

        <main className="h-screen min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <div
        className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/75 px-5 transition duration-200 ease-out ${
          createWorkspaceOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onPointerDown={() => setCreateWorkspaceOpen(false)}
        aria-hidden={!createWorkspaceOpen}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-workspace-title"
          onPointerDown={(event) => event.stopPropagation()}
          className={`w-full max-w-md rounded-xl border border-white/10 bg-[#181818] text-white shadow-[0_24px_70px_rgba(0,0,0,0.35)] transition duration-200 ease-out ${
            createWorkspaceOpen
              ? "translate-y-0 scale-100 opacity-100"
              : "-translate-y-3 scale-95 opacity-0"
          }`}
        >
          <div className="flex items-start justify-between px-5 pb-4 pt-5">
            <h2 id="create-workspace-title" className="text-lg font-semibold">
              Create Workspace
            </h2>
            <button
              type="button"
              onClick={() => setCreateWorkspaceOpen(false)}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/15 hover:text-white"
              aria-label="Close create workspace"
            >
              <XMarkIcon className="size-4.5" />
            </button>
          </div>

          <form className="px-5 pb-5" onSubmit={handleCreateWorkspace}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Workspace name
              </span>
              <input
                type="text"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="e.g. Team A, Marketing"
                className="h-10 w-full rounded-lg border border-white/20 bg-transparent px-3 text-sm outline-none transition placeholder:text-white/35 focus:border-white/55 focus:ring-2 focus:ring-white/10"
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Description <span className="font-normal text-white/40">(optional)</span>
              </span>
              <input
                type="text"
                value={workspaceDescription}
                onChange={(event) => setWorkspaceDescription(event.target.value)}
                className="h-10 w-full rounded-lg border border-white/20 bg-transparent px-3 text-sm outline-none transition focus:border-white/55 focus:ring-2 focus:ring-white/10"
              />
            </label>

            {createWorkspaceError ? (
              <p className="mt-3 text-sm text-red-300">{createWorkspaceError}</p>
            ) : null}

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                disabled={creatingWorkspace}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingWorkspace ? "Saving..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-[210] flex items-center justify-center bg-black/75 px-5 transition duration-200 ease-out ${
          importRequestsOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onPointerDown={() => setImportRequestsOpen(false)}
        aria-hidden={!importRequestsOpen}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-requests-title"
          onPointerDown={(event) => event.stopPropagation()}
          className={`w-full max-w-lg rounded-xl border border-white/10 bg-[#181818] text-white shadow-[0_24px_70px_rgba(0,0,0,0.35)] transition duration-200 ease-out ${
            importRequestsOpen
              ? "translate-y-0 scale-100 opacity-100"
              : "-translate-y-3 scale-95 opacity-0"
          }`}
        >
          <div className="flex items-start justify-between px-5 pb-3 pt-5">
            <div>
              <h2 id="import-requests-title" className="text-lg font-semibold">
                Import permintaan data
              </h2>
              <p className="mt-1 text-xs leading-5 text-white/45">
                Project dibuat dari lembaga, task dari detail kebutuhan, dengan
                prioritas Urgent dan tenggat 7 hari.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setImportRequestsOpen(false)}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/15 hover:text-white"
              aria-label="Close import spreadsheet"
            >
              <XMarkIcon className="size-4.5" />
            </button>
          </div>

          <form className="px-5 pb-5" onSubmit={handleImportRequests}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-white/65">
                Workspace
              </span>
              <input
                type="text"
                value={importWorkspaceName}
                onChange={(event) => setImportWorkspaceName(event.target.value)}
                className="h-9 w-full rounded-lg border border-white/20 bg-transparent px-3 text-sm outline-none transition placeholder:text-white/35 focus:border-white/55"
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-semibold text-white/65">
                Link Google Sheet
              </span>
              <input
                type="url"
                value={importSheetUrl}
                onChange={(event) => {
                  setImportSheetUrl(event.target.value);
                  if (event.target.value) {
                    setImportCsv("");
                    setImportFileName("");
                  }
                  setImportResult(null);
                  setImportMonitoringLinks([]);
                }}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="h-9 w-full rounded-lg border border-white/20 bg-transparent px-3 text-sm outline-none transition placeholder:text-white/30 focus:border-white/55"
              />
              <span className="mt-1 block text-[11px] text-white/35">
                Google Sheet harus dapat diakses lewat link.
              </span>
            </label>

            <div className="my-3 flex items-center gap-3 text-[11px] text-white/30">
              <span className="h-px flex-1 bg-white/10" />
              atau
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <input
              ref={importCsvInputRef}
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => importCsvInputRef.current?.click()}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 text-sm font-medium text-white/65 transition hover:border-white/40 hover:bg-white/5 hover:text-white"
            >
              <ArrowUpTrayIcon className="size-4" />
              {importFileName || "Pilih file CSV atau TSV"}
            </button>

            {importError ? (
              <p className="mt-3 text-xs text-red-300">{importError}</p>
            ) : null}

            {importResult ? (
              <div className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs leading-5 text-emerald-200">
                {importResult.rows} baris diproses: {importResult.created} task
                baru, {importResult.updated} diperbarui, {importResult.skipped}{" "}
                dilewati, dan {importResult.projectsCreated} project baru.
                {importResult.skippedRows?.length ? (
                  <ul className="mt-1 list-disc pl-4 text-amber-200">
                    {importResult.skippedRows.slice(0, 5).map((item) => (
                      <li key={`${item.row}-${item.reason}`}>
                        Baris {item.row}: {item.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {importMonitoringLinks.length ? (
              <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-white/10">
                <div className="sticky top-0 border-b border-white/10 bg-[#181818] px-3 py-2 text-[11px] font-semibold uppercase text-white/45">
                  Link monitoring pemohon
                </div>
                {importMonitoringLinks.map((item) => (
                  <div
                    key={item.taskId}
                    className="flex items-center gap-3 border-b border-white/10 px-3 py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white/85">
                        {item.requesterName}
                      </p>
                      <p className="truncate text-[11px] text-white/40">
                        {item.taskName}
                        {item.requesterEmail ? ` · ${item.requesterEmail}` : ""}
                      </p>
                    </div>
                    <Link
                      href={item.path}
                      target="_blank"
                      className="shrink-0 text-xs font-semibold text-white/70 transition hover:text-white"
                    >
                      Buka
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          `${window.location.origin}${item.path}`,
                        );
                        setCopiedMonitoringTaskId(item.taskId);
                        window.setTimeout(
                          () => setCopiedMonitoringTaskId(null),
                          1500,
                        );
                      }}
                      className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/70 transition hover:bg-white/15 hover:text-white"
                    >
                      {copiedMonitoringTaskId === item.taskId
                        ? "Tersalin"
                        : "Salin"}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={importing}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importing ? "Mengimpor..." : "Import"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/75 px-5 transition duration-200 ease-out ${
          createProjectOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onPointerDown={() => setCreateProjectOpen(false)}
        aria-hidden={!createProjectOpen}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-project-title"
          onPointerDown={(event) => event.stopPropagation()}
          className={`w-full max-w-2xl rounded-xl border border-white/10 bg-[#181818] text-white shadow-[0_24px_70px_rgba(0,0,0,0.35)] transition duration-200 ease-out ${
            createProjectOpen
              ? "translate-y-0 scale-100 opacity-100"
              : "-translate-y-3 scale-95 opacity-0"
          }`}
        >
          <div className="flex items-start justify-between px-6 pb-5 pt-6">
            <div>
              <h2 id="create-project-title" className="text-xl font-semibold">
                Create a Project
              </h2>
              <p className="mt-1 text-sm text-white/45">
                Workspace: {activeWorkspace?.name ?? "-"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateProjectOpen(false)}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/15 hover:text-white"
              aria-label="Close create project"
            >
              <XMarkIcon className="size-5" />
            </button>
          </div>

          <form className="px-6" onSubmit={handleCreateProject}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-white/70">
                Project name
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="e.g. Marketing, Engineering, HR"
                className="h-11 w-full rounded-lg border border-white/20 bg-transparent px-3 text-sm outline-none transition placeholder:text-white/35 focus:border-white/55 focus:ring-2 focus:ring-white/10"
              />
            </div>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Description <span className="font-normal text-white/40">(optional)</span>
              </span>
              <input
                type="text"
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
                className="h-11 w-full rounded-lg border border-white/20 bg-transparent px-3 text-sm outline-none transition focus:border-white/55 focus:ring-2 focus:ring-white/10"
              />
            </label>

            {createProjectError ? (
              <p className="mt-3 text-sm text-red-300">{createProjectError}</p>
            ) : null}

            <div className="-mx-6 mt-6 flex items-center justify-end px-6 py-4">
              <button
                type="submit"
                disabled={creatingProject}
                className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingProject ? "Saving..." : "Continue"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/75 px-5 transition duration-200 ease-out ${
          manageWorkspaceOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onPointerDown={() => setManageWorkspaceOpen(false)}
        aria-hidden={!manageWorkspaceOpen}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="manage-workspace-title"
          onPointerDown={(event) => event.stopPropagation()}
          className={`max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-white/10 bg-[#181818] text-white shadow-[0_24px_70px_rgba(0,0,0,0.35)] transition duration-200 ease-out ${
            manageWorkspaceOpen
              ? "translate-y-0 scale-100 opacity-100"
              : "-translate-y-3 scale-95 opacity-0"
          }`}
        >
          <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
            <div className="min-w-0">
              <h2
                id="manage-workspace-title"
                className="truncate text-lg font-semibold"
              >
                Manage workspace
              </h2>
              <p className="mt-1 truncate text-sm text-white/45">
                {managedWorkspace?.name ?? "Workspace"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {manageWorkspaceTab === "team" && canManageWorkspaceMembers ? (
                <button
                  type="button"
                  onClick={() => setAddWorkspaceMemberOpen((open) => !open)}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black transition hover:bg-white/85"
                >
                  <PlusIcon className="size-4" />
                  Add
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setManageWorkspaceOpen(false)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/15 hover:text-white"
                aria-label="Close manage workspace"
              >
                <XMarkIcon className="size-4.5" />
              </button>
            </div>
          </div>

          <div className="flex border-b border-white/10 px-5">
            <button
              type="button"
              onClick={() => {
                setManageWorkspaceTab("workspace");
                setAddWorkspaceMemberOpen(false);
              }}
              className={`relative px-3 py-3 text-sm font-semibold transition ${
                manageWorkspaceTab === "workspace"
                  ? "text-white"
                  : "text-white/45 hover:text-white/75"
              }`}
            >
              Workspace
              {manageWorkspaceTab === "workspace" ? (
                <span className="absolute inset-x-3 bottom-0 h-0.5 bg-white" />
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setManageWorkspaceTab("team")}
              className={`relative px-3 py-3 text-sm font-semibold transition ${
                manageWorkspaceTab === "team"
                  ? "text-white"
                  : "text-white/45 hover:text-white/75"
              }`}
            >
              Team
              {manageWorkspaceTab === "team" ? (
                <span className="absolute inset-x-3 bottom-0 h-0.5 bg-white" />
              ) : null}
            </button>
          </div>

          <div className="px-5 pb-12 pt-4">
            {manageWorkspaceTab === "workspace" ? (
              <form
                onSubmit={handleSaveWorkspaceDetails}
                className="mx-auto w-full max-w-2xl space-y-5 py-2"
              >
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-white/55">
                    Workspace name
                  </span>
                  <input
                    type="text"
                    value={managedWorkspaceName}
                    onChange={(event) =>
                      setManagedWorkspaceName(event.target.value)
                    }
                    disabled={!canManageWorkspaceMembers}
                    className="h-10 w-full rounded-lg border border-white/15 bg-transparent px-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/50 focus:ring-2 focus:ring-white/10 disabled:cursor-default disabled:text-white/60"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-white/55">
                    Description
                  </span>
                  <textarea
                    value={managedWorkspaceDescription}
                    onChange={(event) =>
                      setManagedWorkspaceDescription(event.target.value)
                    }
                    disabled={!canManageWorkspaceMembers}
                    rows={4}
                    placeholder="Add a workspace description"
                    className="w-full resize-none rounded-lg border border-white/15 bg-transparent px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/50 focus:ring-2 focus:ring-white/10 disabled:cursor-default disabled:text-white/60"
                  />
                </label>

                <div className="flex items-center justify-between gap-5 rounded-lg border border-white/10 px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white/80">
                      Publish workspace
                    </p>
                    <p className="mt-0.5 text-xs text-white/40">
                      Tampilkan progres project non-private di /index tanpa login.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={managedWorkspacePublished}
                    aria-label="Publish workspace"
                    disabled={!canManageWorkspaceMembers}
                    onClick={() =>
                      setManagedWorkspacePublished((published) => !published)
                    }
                    className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-default disabled:opacity-50 ${
                      managedWorkspacePublished ? "bg-violet-500" : "bg-white/20"
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${
                        managedWorkspacePublished
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {managedWorkspace && canManageWorkspaceMembers ? (
                  <WhatsAppGroupConnection
                    scopeType="workspace"
                    scopeId={managedWorkspace.id}
                    scopeName={managedWorkspace.name}
                  />
                ) : null}

                {workspaceDetailsError ? (
                  <p className="text-xs text-red-300">{workspaceDetailsError}</p>
                ) : null}

                {canManageWorkspaceMembers ? (
                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={savingWorkspaceDetails}
                      className="workspace-save-button h-9 rounded-lg px-4 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingWorkspaceDetails ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-white/35">
                    Hanya owner dan administrator yang dapat mengubah workspace.
                  </p>
                )}
              </form>
            ) : (
              <>
            {addWorkspaceMemberOpen && canManageWorkspaceMembers ? (
              <form
                onSubmit={handleAddWorkspaceMember}
                className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
                  <div className="relative">
                    <input
                      type="text"
                      value={memberEmail}
                      onChange={(event) => {
                        setMemberEmail(event.target.value);
                        setUserOptions([]);
                        setLoadingUserOptions(false);
                        setSelectedMember(null);
                      }}
                      placeholder="Cari nama atau email user"
                      className="h-9 w-full rounded-lg border border-white/15 bg-transparent px-3 text-sm outline-none transition placeholder:text-white/30 focus:border-white/55 focus:ring-2 focus:ring-white/10"
                    />
                    {addWorkspaceMemberOpen && memberEmail.trim().length >= 2 && !selectedMember ? (
                      <div className="absolute left-0 top-10 z-50 max-h-48 w-full overflow-y-auto rounded-lg border border-white/10 bg-[#202020] p-1 shadow-xl">
                        {loadingUserOptions ? (
                          <p className="px-2 py-1.5 text-xs text-white/40">
                            Loading users...
                          </p>
                        ) : userOptions.length ? (
                          userOptions.map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => {
                                setSelectedMember(user);
                                setMemberEmail(user.email);
                                setUserOptions([]);
                                setMemberError("");
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/10"
                            >
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-black">
                                {user.name
                                  .split(" ")
                                  .map((part) => part[0])
                                  .join("")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-semibold text-white/80">
                                  {user.name}
                                </span>
                                <span className="block truncate text-[11px] text-white/40">
                                  {user.email}
                                </span>
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="px-2 py-1.5 text-xs text-white/40">
                            User belum ditemukan. Masukkan email lengkap untuk mengundang.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                  <select
                    value={memberRole}
                    onChange={(event) =>
                      setMemberRole(
                        event.target.value as (typeof workspaceRoles)[number],
                      )
                    }
                    className="h-9 rounded-lg border border-white/15 bg-[#181818] px-3 text-sm outline-none transition focus:border-white/55 focus:ring-2 focus:ring-white/10"
                  >
                    {workspaceRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                {managedWorkspace?.projects.length ? (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-semibold text-white/45">
                      Project access
                    </p>
                    <div className="rounded-lg border border-white/10 bg-[#181818] p-2">
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {getSelectedProjects(memberProjectIds).map((project) => (
                          <span
                            key={project.id}
                            className="inline-flex max-w-[180px] items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white/75"
                          >
                            <span className="truncate">{project.name}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setMemberProjectIds((currentIds) =>
                                  currentIds.filter((id) => id !== project.id),
                                )
                              }
                              className="text-white/40 hover:text-white"
                              aria-label={`Remove ${project.name}`}
                            >
                              <XMarkIcon className="size-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={memberProjectSearch}
                        onChange={(event) =>
                          setMemberProjectSearch(event.target.value)
                        }
                        placeholder="Ketik nama project"
                        className="h-8 w-full rounded-md border border-white/10 bg-transparent px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/35"
                      />
                      <div className="mt-1 max-h-28 overflow-y-auto">
                        {getProjectOptions(memberProjectSearch, memberProjectIds).map(
                          (project) => (
                            <button
                              key={project.id}
                              type="button"
                              onClick={() => {
                                setMemberProjectIds((currentIds) => [
                                  ...currentIds,
                                  project.id,
                                ]);
                                setMemberProjectSearch("");
                              }}
                              className="flex w-full rounded-md px-2 py-1.5 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white"
                            >
                              {project.name}
                            </button>
                          ),
                        )}
                        {memberProjectSearch &&
                        !getProjectOptions(memberProjectSearch, memberProjectIds)
                          .length ? (
                          <p className="px-2 py-1.5 text-xs text-white/35">
                            Project tidak ditemukan
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {memberError ? (
                  <p className="mt-2 text-xs text-red-300">{memberError}</p>
                ) : null}

                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAddWorkspaceMemberOpen(false);
                      setMemberError("");
                      setMemberEmail("");
                      setSelectedMember(null);
                      setUserOptions([]);
                      setMemberProjectIds([]);
                      setMemberProjectSearch("");
                    }}
                    className="rounded-md px-3 py-1.5 text-xs font-semibold text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingWorkspaceMember}
                    className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white/85 disabled:opacity-60"
                  >
                    {addingWorkspaceMember ? "Mengundang..." : "Kirim undangan"}
                  </button>
                </div>
              </form>
            ) : null}

            {memberNotice ? <p role="status" className="mb-3 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">{memberNotice}</p> : null}
            {memberError && !addWorkspaceMemberOpen ? <p role="alert" className="mb-3 text-sm text-red-300">{memberError}</p> : null}
            {pendingInvitations.length ? <section className="mb-4 rounded-lg border border-white/10 p-3">
              <h3 className="mb-2 text-sm font-semibold">Undangan menunggu</h3>
              {pendingInvitations.map(invitation => <div key={invitation.id} className="flex justify-between gap-3 py-2 text-sm text-white/60"><span className="break-all">{invitation.email}</span><span>{invitation.role} · Pending</span></div>)}
            </section> : null}
            <div className="overflow-visible">
              {loadingWorkspaceMembers ? (
                <p className="px-3 py-4 text-sm text-white/45">Loading members...</p>
              ) : (
                <div className="space-y-3">
                  {workspaceRoleSections.map((role) => {
                    const roleMembers = workspaceMembers.filter(
                      (member) => member.role === role,
                    );

                    return (
                      <section
                        key={role}
                        onDragOver={(event) => {
                          if (
                            role === "owner" ||
                            !canManageWorkspaceMembers ||
                            draggedWorkspaceMemberId === null
                          ) {
                            return;
                          }

                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setWorkspaceRoleDropTarget(role);
                        }}
                        onDragLeave={(event) => {
                          if (
                            !event.currentTarget.contains(
                              event.relatedTarget as Node | null,
                            )
                          ) {
                            setWorkspaceRoleDropTarget(null);
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (role !== "owner") {
                            moveWorkspaceMemberToRole(role);
                          }
                        }}
                        className={`overflow-visible rounded-lg border transition-colors ${
                          workspaceRoleDropTarget === role
                            ? "border-violet-500/70 bg-violet-500/[0.07]"
                            : "border-white/10"
                        }`}
                      >
                        <div className="grid grid-cols-[1fr_150px_190px] bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/40">
                          <span className="capitalize text-white/55">{role}</span>
                          <span>Role</span>
                          <span>Project</span>
                        </div>
                        {roleMembers.length ? (
                          roleMembers.map((member) => (
                  <div
                    key={member.id}
                    draggable={canManageWorkspaceMembers && !member.isOwner}
                    onDragStart={(event) => {
                      if (!canManageWorkspaceMembers || member.isOwner) {
                        event.preventDefault();
                        return;
                      }

                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(member.id));
                      setDraggedWorkspaceMemberId(member.id);
                    }}
                    onDragEnd={() => {
                      setDraggedWorkspaceMemberId(null);
                      setWorkspaceRoleDropTarget(null);
                    }}
                    className={`grid grid-cols-[1fr_150px_190px] items-center border-b border-white/10 px-3 py-2.5 transition last:border-b-0 ${
                      canManageWorkspaceMembers && !member.isOwner
                        ? "cursor-grab active:cursor-grabbing"
                        : ""
                    } ${
                      draggedWorkspaceMemberId === member.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {canManageWorkspaceMembers && !member.isOwner ? (
                        <GripVertical
                          className="size-4 shrink-0 text-white/25"
                          aria-hidden="true"
                        />
                      ) : null}
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-black">
                        {member.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white/85">
                          {member.name}
                        </span>
                        <span className="block truncate text-xs text-white/40">
                          {member.email}
                        </span>
                      </span>
                      {canManageWorkspaceMembers && !member.isOwner ? <button type="button" disabled={deletingMember !== null} onClick={() => setMemberToDelete(member)} aria-label={`Hapus ${member.name}`} className="ml-auto mr-3 rounded-md px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40">{deletingMember === member.id ? "Menghapus..." : "Hapus"}</button> : null}
                    </div>
                    {canManageWorkspaceMembers && !member.isOwner ? (
                      <select
                        value={member.role}
                        onChange={(event) =>
                          void updateWorkspaceMember(member, {
                            role: event.target.value as WorkspaceMember["role"],
                          })
                        }
                        className="h-8 w-32 rounded-md border border-white/10 bg-[#181818] px-2 text-xs font-semibold capitalize text-white/70 outline-none focus:border-white/35"
                      >
                        {workspaceRoles.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="px-2 text-xs font-semibold capitalize text-white/60">
                        {member.role}
                      </span>
                    )}
                    <div className="relative">
                      {canManageWorkspaceMembers && !member.isOwner ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProjectSearch("");
                            setOpenMemberProjectsId((currentId) =>
                              currentId === member.id ? null : member.id,
                            );
                          }}
                          className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-white/10 px-2 text-left text-xs text-white/60 hover:bg-white/10 hover:text-white"
                        >
                          <span className="truncate">
                            {member.projects.length
                              ? member.projects
                                  .map((project) => project.name)
                                  .join(", ")
                              : "No project"}
                          </span>
                          <ChevronDownIcon className="size-3 shrink-0 text-white/40" />
                        </button>
                      ) : (
                        <span className="block truncate px-2 text-xs text-white/60">
                          {member.isOwner
                            ? "All projects"
                            : member.projects.length
                              ? member.projects
                                  .map((project) => project.name)
                                  .join(", ")
                              : "No project"}
                        </span>
                      )}
                      {canManageWorkspaceMembers &&
                      !member.isOwner &&
                      openMemberProjectsId === member.id ? (
                        <div className="absolute right-0 top-9 z-[80] w-64 rounded-lg border border-white/10 bg-[#202020] p-2 shadow-xl">
                          {managedWorkspace?.projects.length ? (
                            <>
                              <div className="mb-2 flex flex-wrap gap-1.5">
                                {member.projects.map((project) => (
                                  <span
                                    key={project.id}
                                    className="inline-flex max-w-[180px] items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white/75"
                                  >
                                    <span className="truncate">{project.name}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void updateWorkspaceMember(member, {
                                          projects: member.projects.filter(
                                            (memberProject) =>
                                              memberProject.id !== project.id,
                                          ),
                                        })
                                      }
                                      className="text-white/40 hover:text-white"
                                      aria-label={`Remove ${project.name}`}
                                    >
                                      <XMarkIcon className="size-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                              <input
                                type="text"
                                value={editingProjectSearch}
                                onChange={(event) =>
                                  setEditingProjectSearch(event.target.value)
                                }
                                placeholder="Ketik nama project"
                                className="h-8 w-full rounded-md border border-white/10 bg-transparent px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/35"
                              />
                              <button
                                type="button"
                                disabled={managedWorkspace.projects.every(project => member.projects.some(selected => selected.id === project.id))}
                                onClick={() => {
                                  void updateWorkspaceMember(member, { projects: managedWorkspace.projects });
                                  setEditingProjectSearch("");
                                }}
                                className="mt-2 flex w-full rounded-md border-b border-white/10 px-2 py-2 text-left text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-40"
                              >
                                All projects
                              </button>
                              <div className="mt-1 max-h-32 overflow-y-auto">
                                {getProjectOptions(
                                  editingProjectSearch,
                                  member.projects.map((project) => project.id),
                                ).map((project) => (
                                  <button
                                    key={project.id}
                                    type="button"
                                    onClick={() => {
                                      void updateWorkspaceMember(member, {
                                        projects: [...member.projects, project],
                                      });
                                      setEditingProjectSearch("");
                                    }}
                                    className="flex w-full rounded-md px-2 py-1.5 text-left text-xs text-white/70 hover:bg-white/10 hover:text-white"
                                  >
                                    {project.name}
                                  </button>
                                ))}
                                {editingProjectSearch &&
                                !getProjectOptions(
                                  editingProjectSearch,
                                  member.projects.map((project) => project.id),
                                ).length ? (
                                  <p className="px-2 py-1.5 text-xs text-white/35">
                                    Project tidak ditemukan
                                  </p>
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <p className="px-2 py-1.5 text-xs text-white/40">
                              Belum ada project
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                          ))
                        ) : (
                          <p className="px-3 py-3 text-xs text-white/30">
                            No {role}
                          </p>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/75 px-5 transition duration-200 ease-out ${
          manageProjectOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onPointerDown={() => setManageProjectOpen(false)}
        aria-hidden={!manageProjectOpen}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="manage-project-title"
          onPointerDown={(event) => event.stopPropagation()}
          className={`w-full max-w-2xl rounded-xl border border-white/10 bg-[#181818] text-white shadow-[0_24px_70px_rgba(0,0,0,0.35)] transition duration-200 ease-out ${
            manageProjectOpen
              ? "translate-y-0 scale-100 opacity-100"
              : "-translate-y-3 scale-95 opacity-0"
          }`}
        >
          <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
            <div className="min-w-0">
              <h2 id="manage-project-title" className="truncate text-lg font-semibold">
                Manage project
              </h2>
              <p className="mt-1 truncate text-sm text-white/45">
                {managedProject?.name ?? "Project"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {manageProjectTab === "team" &&
              managedProject?.permission === "Full akses" ? (
                <button
                  type="button"
                  onClick={() => setAddProjectMemberOpen((open) => !open)}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-black transition hover:bg-white/85"
                >
                  <PlusIcon className="size-4" />
                  Add
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setManageProjectOpen(false)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/15 hover:text-white"
                aria-label="Close manage project"
              >
                <XMarkIcon className="size-4.5" />
              </button>
            </div>
          </div>

          <div className="flex border-b border-white/10 px-5">
            <button
              type="button"
              onClick={() => {
                setManageProjectTab("project");
                setAddProjectMemberOpen(false);
              }}
              className={`relative px-3 py-3 text-sm font-semibold transition ${
                manageProjectTab === "project"
                  ? "text-white"
                  : "text-white/45 hover:text-white/75"
              }`}
            >
              Project
              {manageProjectTab === "project" ? (
                <span className="absolute inset-x-3 bottom-0 h-0.5 bg-white" />
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setManageProjectTab("team")}
              className={`relative px-3 py-3 text-sm font-semibold transition ${
                manageProjectTab === "team"
                  ? "text-white"
                  : "text-white/45 hover:text-white/75"
              }`}
            >
              Team
              {manageProjectTab === "team" ? (
                <span className="absolute inset-x-3 bottom-0 h-0.5 bg-white" />
              ) : null}
            </button>
          </div>

          <div className="px-5 pb-8 pt-4">
            {manageProjectTab === "project" ? (
              <form
                onSubmit={handleSaveProjectDetails}
                className="mx-auto w-full max-w-xl space-y-5 py-2"
              >
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-white/55">
                    Project name
                  </span>
                  <input
                    type="text"
                    value={managedProjectName}
                    onChange={(event) => setManagedProjectName(event.target.value)}
                    disabled={managedProject?.permission !== "Full akses"}
                    className="h-10 w-full rounded-lg border border-white/15 bg-transparent px-3 text-sm text-white outline-none transition focus:border-white/50 focus:ring-2 focus:ring-white/10 disabled:cursor-default disabled:text-white/60"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-white/55">
                    Description
                  </span>
                  <textarea
                    value={managedProjectDescription}
                    onChange={(event) =>
                      setManagedProjectDescription(event.target.value)
                    }
                    disabled={managedProject?.permission !== "Full akses"}
                    rows={3}
                    placeholder="Add a project description"
                    className="w-full resize-none rounded-lg border border-white/15 bg-transparent px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/50 focus:ring-2 focus:ring-white/10 disabled:cursor-default disabled:text-white/60"
                  />
                </label>

                <div className="flex items-center justify-between gap-5 rounded-lg border border-white/10 px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white/80">
                      Publish project
                    </p>
                    <p className="mt-0.5 text-xs text-white/40">
                      {managedProjectPublishMode === "inherit"
                        ? managedProjectWorkspace?.isPublished
                          ? "Mengikuti workspace yang sedang dipublish."
                          : "Mengikuti workspace yang belum dipublish."
                        : managedProjectPublished
                          ? "Project dipublish meskipun workspace tidak dipublish."
                          : "Project disembunyikan meskipun workspace dipublish."}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={managedProjectPublished}
                    aria-label="Publish project"
                    disabled={managedProject?.permission !== "Full akses"}
                    onClick={() => {
                      const nextPublished = !managedProjectPublished;
                      const workspacePublished = Boolean(
                        managedProjectWorkspace?.isPublished,
                      );

                      setManagedProjectPublishMode(
                        nextPublished === workspacePublished
                          ? "inherit"
                          : nextPublished
                            ? "published"
                            : "hidden",
                      );
                    }}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-default disabled:opacity-50 ${
                      managedProjectPublished ? "bg-violet-500" : "bg-white/20"
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${
                        managedProjectPublished
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {managedProject &&
                (managedProject.permission === "Full akses" ||
                  managedProject.permission === "Manage") ? (
                  <WhatsAppGroupConnection
                    scopeType="project"
                    scopeId={managedProject.id}
                    scopeName={managedProject.name}
                  />
                ) : null}

                {projectDetailsError ? (
                  <p className="text-xs text-red-300">{projectDetailsError}</p>
                ) : null}

                {managedProject?.permission === "Full akses" ? (
                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={savingProjectDetails}
                      className="h-9 rounded-lg bg-white px-4 text-xs font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingProjectDetails ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-white/35">
                    Hanya member dengan Full akses yang dapat mengubah project.
                  </p>
                )}
              </form>
            ) : (
              <>
            {addProjectMemberOpen ? (
              <form
                onSubmit={handleAddProjectMember}
                className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
                  <div className="relative">
                    <input
                      type="text"
                      value={projectMemberSearch}
                      onChange={(event) => {
                        setProjectMemberSearch(event.target.value);
                        setSelectedProjectMember(null);
                      }}
                      placeholder="Cari nama atau email user"
                      className="h-9 w-full rounded-lg border border-white/15 bg-transparent px-3 text-sm outline-none transition placeholder:text-white/30 focus:border-white/55 focus:ring-2 focus:ring-white/10"
                    />
                    {addProjectMemberOpen && !selectedProjectMember ? (
                      <div className="absolute left-0 top-10 z-50 max-h-48 w-full overflow-y-auto rounded-lg border border-white/10 bg-[#202020] p-1 shadow-xl">
                        {loadingProjectUserOptions ? (
                          <p className="px-2 py-1.5 text-xs text-white/40">
                            Loading users...
                          </p>
                        ) : projectUserOptions.length ? (
                          projectUserOptions.map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => {
                                setSelectedProjectMember(user);
                                setProjectMemberSearch(user.email);
                                setProjectUserOptions([]);
                                setProjectMemberError("");
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/10"
                            >
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-black">
                                {user.name
                                  .split(" ")
                                  .map((part) => part[0])
                                  .join("")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-semibold text-white/80">
                                  {user.name}
                                </span>
                                <span className="block truncate text-[11px] text-white/40">
                                  {user.email}
                                </span>
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="px-2 py-1.5 text-xs text-white/40">
                            User tidak ditemukan
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                  <select
                    value={projectMemberPermission}
                    onChange={(event) =>
                      setProjectMemberPermission(
                        event.target.value as (typeof projectPermissions)[number],
                      )
                    }
                    className="h-9 rounded-lg border border-white/15 bg-[#181818] px-3 text-sm outline-none transition focus:border-white/55 focus:ring-2 focus:ring-white/10"
                  >
                    {projectPermissions.map((permission) => (
                      <option key={permission} value={permission}>
                        {permission}
                      </option>
                    ))}
                  </select>
                </div>

                {projectMemberError ? (
                  <p className="mt-2 text-xs text-red-300">
                    {projectMemberError}
                  </p>
                ) : null}

                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAddProjectMemberOpen(false);
                      setProjectMemberError("");
                      setProjectMemberSearch("");
                      setSelectedProjectMember(null);
                      setProjectUserOptions([]);
                    }}
                    className="rounded-md px-3 py-1.5 text-xs font-semibold text-white/50 hover:bg-white/10 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingProjectMember}
                    className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-white/85 disabled:opacity-60"
                  >
                    {addingProjectMember ? "Adding..." : "Add member"}
                  </button>
                </div>
              </form>
            ) : null}

            <div className="overflow-visible">
              {loadingProjectMembers ? (
                <p className="px-3 py-4 text-sm text-white/45">Loading members...</p>
              ) : (
                <div className="space-y-3">
                  {projectPermissions.map((permission) => {
                    const permissionMembers = projectMembers.filter(
                      (member) => member.permission === permission,
                    );

                    return (
                      <section
                        key={permission}
                        onDragOver={(event) => {
                          if (draggedProjectMemberId === null) {
                            return;
                          }

                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setProjectPermissionDropTarget(permission);
                        }}
                        onDragLeave={(event) => {
                          if (
                            !event.currentTarget.contains(
                              event.relatedTarget as Node | null,
                            )
                          ) {
                            setProjectPermissionDropTarget(null);
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          moveProjectMemberToPermission(permission);
                        }}
                        className={`overflow-visible rounded-lg border transition-colors ${
                          projectPermissionDropTarget === permission
                            ? "border-violet-500/70 bg-violet-500/[0.07]"
                            : "border-white/10"
                        }`}
                      >
                        <div className="grid grid-cols-[1fr_150px] bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/40">
                          <span className="text-white/55">{permission}</span>
                          <span>Permission</span>
                        </div>
                        {permissionMembers.length ? (
                          permissionMembers.map((member) => (
                  <div
                    key={member.id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(member.id));
                      setDraggedProjectMemberId(member.id);
                    }}
                    onDragEnd={() => {
                      setDraggedProjectMemberId(null);
                      setProjectPermissionDropTarget(null);
                    }}
                    className={`grid cursor-grab grid-cols-[1fr_150px] items-center border-b border-white/10 px-3 py-2.5 transition last:border-b-0 active:cursor-grabbing ${
                      draggedProjectMemberId === member.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <GripVertical
                        className="size-4 shrink-0 text-white/25"
                        aria-hidden="true"
                      />
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-black">
                        {member.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white/85">
                          {member.name}
                        </span>
                        <span className="block truncate text-xs text-white/40">
                          {member.email}
                        </span>
                      </span>
                      {!member.isOwner && managedProject?.permission === "Full akses" ? (
                        <button
                          type="button"
                          onClick={() => setProjectMemberToDelete(member)}
                          aria-label={`Hapus ${member.name} dari project`}
                          className="ml-auto mr-3 rounded-md px-2 py-1 text-xs text-red-300 transition hover:bg-red-500/10"
                        >
                          Hapus
                        </button>
                      ) : null}
                    </div>
                    <select
                      value={member.permission}
                      onChange={(event) =>
                        void updateProjectMemberPermission(
                          member,
                          event.target.value as ProjectMember["permission"],
                        )
                      }
                      className="h-8 w-32 rounded-md border border-white/10 bg-[#181818] px-2 text-xs font-semibold text-white/70 outline-none focus:border-white/35"
                    >
                      {projectPermissions.map((permission) => (
                        <option key={permission} value={permission}>
                          {permission}
                        </option>
                      ))}
                    </select>
                  </div>
                          ))
                        ) : (
                          <p className="px-3 py-3 text-xs text-white/30">
                            No member
                          </p>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  icon,
  checked,
  tabIndex,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  checked: boolean;
  tabIndex?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={tabIndex}
      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] font-medium text-white/85 hover:bg-white/10"
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={`flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition ${
          checked ? "bg-[#16a394]" : "bg-[#909090]"
        }`}
      >
        <span
          className={`size-3 rounded-full bg-white transition ${
            checked ? "translate-x-3" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
