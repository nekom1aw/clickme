import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getPublicMonitoringTask } from "@/lib/data-request-monitoring";
import MonitoringClient from "./monitoring-client";

export const dynamic = "force-dynamic";

type MonitoringPageProps = {
  params: Promise<{ token: string }>;
};

const getTask = cache(getPublicMonitoringTask);

export async function generateMetadata({
  params,
}: MonitoringPageProps): Promise<Metadata> {
  const { token } = await params;
  const task = await getTask(token);

  return {
    title:
      task?.kind === "shared"
        ? `${task.name} · ${task.projectName}`
        : "Monitoring Permintaan Data",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function MonitoringPage({ params }: MonitoringPageProps) {
  const { token } = await params;
  const task = await getTask(token);

  if (!task) {
    notFound();
  }

  return <MonitoringClient token={token} initialTask={task} />;
}
