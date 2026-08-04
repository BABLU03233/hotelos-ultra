import { Info, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** A one-off explanatory box — "why this step matters" or "here's a gotcha." Use `tone="warning"` for things that commonly trip people up. */
export function InfoCallout({
  title,
  children,
  tone = "info",
}: {
  title?: string;
  children: React.ReactNode;
  tone?: "info" | "warning";
}) {
  const Icon = tone === "warning" ? TriangleAlert : Info;
  return (
    <Alert variant={tone}>
      <Icon />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
