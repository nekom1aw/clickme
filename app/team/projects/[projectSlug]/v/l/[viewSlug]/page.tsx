import ProjectPage from "../../project-page";

export default async function ListProjectSlugPage(
  props: PageProps<"/team/projects/[projectSlug]/v/l/[viewSlug]">,
) {
  const { projectSlug, viewSlug } = await props.params;

  return (
    <ProjectPage
      projectSlug={projectSlug}
      viewSlug={viewSlug}
      viewMode="list"
    />
  );
}
