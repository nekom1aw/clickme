import type { Metadata } from "next";
import TeamShell from "./team-shell";

export const metadata: Metadata = {
  title: "Team | Clickme",
  description: "Team workspace for Clickme",
};

export default function TeamLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <TeamShell>{children}</TeamShell>;
}
