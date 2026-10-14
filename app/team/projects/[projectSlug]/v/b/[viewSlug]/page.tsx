import ProjectPage from "../../project-page";

export default async function BoardProjectSlugPage(
  props: PageProps<"/team/projects/[projectSlug]/v/b/[viewSlug]">,
) {
  const { projectSlug, viewSlug } = await props.params;

  return (
    <ProjectPage
      projectSlug={projectSlug}
      viewSlug={viewSlug}
      viewMode="board"
    />
  );
}
