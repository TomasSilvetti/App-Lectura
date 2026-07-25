import { AppHeader } from "@/components/app-header";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata = { title: "Ajustes — Lectura" };

export default function SettingsPage() {
  return (
    <>
      <AppHeader title="Ajustes" />
      <SettingsView />
    </>
  );
}
