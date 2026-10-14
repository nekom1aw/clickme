import { redirectToViewSlug } from "../redirect-to-view";

export default async function BoardProjectPage(
  props: PageProps<"/team/projects/[projectSlug]/v/b">,
) {
  const { projectSlug } = await props.params;

  await redirectToViewSlug(projectSlug, "b");
}
