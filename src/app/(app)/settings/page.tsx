"use client";

import { FaqsSettings } from "@/components/settings/faqs-settings";
import { HotelSettings } from "@/components/settings/hotel-settings";
import { OffersSettings } from "@/components/settings/offers-settings";
import { RoomsSettings } from "@/components/settings/rooms-settings";
import { StaffSettings } from "@/components/settings/staff-settings";
import { WhatsAppSettings } from "@/components/settings/whatsapp-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Reveal } from "@/components/motion/reveal";

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Reveal>
        <div>
          <h1 className="font-heading text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">Everything Aria and your team need to know about the hotel.</p>
        </div>
      </Reveal>

      <Tabs defaultValue="hotel">
        <TabsList>
          <TabsTrigger value="hotel">Hotel</TabsTrigger>
          <TabsTrigger value="rooms">Rooms</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="offers">Offers</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
