import { redirectToViewSlug } from "../redirect-to-view";

export default async function ListProjectPage(
  props: PageProps<"/team/projects/[projectSlug]/v/l">,
) {
  const { projectSlug } = await props.params;

  await redirectToViewSlug(projectSlug, "l");
}
