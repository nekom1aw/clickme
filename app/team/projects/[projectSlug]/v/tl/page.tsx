import { redirectToViewSlug } from "../redirect-to-view";

export default async function TimelineProjectPage(
  props: PageProps<"/team/projects/[projectSlug]/v/tl">,
) {
  const { projectSlug } = await props.params;

  await redirectToViewSlug(projectSlug, "tl");
}
