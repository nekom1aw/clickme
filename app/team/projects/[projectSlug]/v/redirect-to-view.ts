import { redirect } from "next/navigation";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";

type ViewCode = "l" | "b" | "tl";

type ProjectViewRow = DbRow & {
  view_slug: string;
};

export async function redirectToViewSlug(
  projectSlug: string,
  viewCode: ViewCode,
) {
  const [rows] = await db.query<ProjectViewRow[]>(
    `SELECT view_slug
     FROM projects
     WHERE slug = ?
     LIMIT 1`,
    [projectSlug],
  );

  const viewSlug = rows[0]?.view_slug;

  if (!viewSlug) {
    redirect("/team");
  }

  redirect(`/team/projects/${projectSlug}/v/${viewCode}/${viewSlug}`);
}
