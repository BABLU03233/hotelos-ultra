"use client";

import { AccountSettings } from "@/components/settings/account-settings";
import { FaqsSettings } from "@/components/settings/faqs-settings";
import { HotelSettings } from "@/components/settings/hotel-settings";
import { OffersSettings } from "@/components/settings/offers-settings";
import { RoomsSettings } from "@/components/settings/rooms-settings";
import { StaffSettings } from "@/components/settings/staff-settings";
import { WhatsAppSettings } from "@/components/settings/whatsapp-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const VALID_TABS = ["hotel", "rooms", "faqs", "offers", "whatsapp", "staff", "account"] as const;
type SettingsTab = (typeof VALID_TABS)[number];

function resolveTab(tab: string | undefined): SettingsTab {
  return VALID_TABS.includes(tab as SettingsTab) ? (tab as SettingsTab) : "hotel";
}

export function SettingsTabs({ initialTab }: { initialTab?: string }) {
  return (
    <Tabs defaultValue={resolveTab(initialTab)}>
      <TabsList>
        <TabsTrigger value="hotel">Hotel</TabsTrigger>
        <TabsTrigger value="rooms">Rooms</TabsTrigger>
        <TabsTrigger value="faqs">FAQs</TabsTrigger>
        <TabsTrigger value="offers">Offers</TabsTrigger>
        <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
        <TabsTrigger value="staff">Staff</TabsTrigger>
        <TabsTrigger value="account">Account</TabsTrigger>
      </TabsList>

      <TabsContent value="hotel" className="mt-4">
        <HotelSettings />
      </TabsContent>
      <TabsContent value="rooms" className="mt-4">
        <RoomsSettings />
      </TabsContent>
      <TabsContent value="faqs" className="mt-4">
        <FaqsSettings />
      </TabsContent>
      <TabsContent value="offers" className="mt-4">
        <OffersSettings />
      </TabsContent>
      <TabsContent value="whatsapp" className="mt-4">
        <WhatsAppSettings />
      </TabsContent>
      <TabsContent value="staff" className="mt-4">
        <StaffSettings />
      </TabsContent>
      <TabsContent value="account" className="mt-4">
        <AccountSettings />
      </TabsContent>
    </Tabs>
  );
}
