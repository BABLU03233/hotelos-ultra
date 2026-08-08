import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Consistent icon + title + description block for "nothing here yet" states — used instead of bare centered text so every empty state in the app carries the same visual weight. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col items-center justify-center gap-2.5 px-4 py-8 text-center", className)}>
      <div className="flex size-11 items-center justify-center rounded-full bg-primary/10">
        <Icon className="size-5 text-primary" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="max-w-xs text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
