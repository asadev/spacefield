import type { Metadata } from "next";
import Desktop from "./tools/_components/Desktop";

export const metadata: Metadata = {
  title: "Space Field — Your Workspace",
  description:
    "A multi-workspace desktop with native apps for real estate, finance, marketing, sales, and everything in between. Create workspaces, install tools, run them like apps.",
};

/* spacefield.co IS the desktop OS. No marketing, no chrome — you land
 * straight into your workspace. */
export default function SpaceFieldHome() {
  return <Desktop />;
}
