"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { ContactDetail } from "./contact-detail";
import { ContactList } from "./contact-list";

export function CrmWorkspace() {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  return (
    <Card className="h-[calc(100dvh-7.5rem)] flex-row overflow-hidden p-0">
      <div className="w-80 shrink-0 border-r border-border py-3 pl-3 pr-1">
        <ContactList selectedId={selectedId} onSelect={setSelectedId} reloadToken={reloadToken} />
      </div>
      <ContactDetail contactId={selectedId} onChanged={() => setReloadToken((t) => t + 1)} />
    </Card>
  );
}
