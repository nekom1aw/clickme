import FormsManager from "../forms-manager";
export const metadata = { title: "Form | Clickme" };
export default async function Page({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  return (
    <FormsManager
      key={(await params).formId}
      initialFormId={Number((await params).formId)}
    />
  );
}
