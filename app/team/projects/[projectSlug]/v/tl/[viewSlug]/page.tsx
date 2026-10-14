import ProjectPage from "../../project-page";

export default async function TimelineProjectSlugPage(
  props: PageProps<"/team/projects/[projectSlug]/v/tl/[viewSlug]">,
) {
  const { projectSlug, viewSlug } = await props.params;

  return (
    <ProjectPage
      projectSlug={projectSlug}
      viewSlug={viewSlug}
      viewMode="timeline"
    />
  );
}
