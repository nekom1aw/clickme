import PublicForm from "./public-form";
export const metadata = {
  title: "Form | Clickme",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <PublicForm token={(await params).token} />;
}
