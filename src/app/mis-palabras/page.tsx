import { AppHeader } from "@/components/app-header";
import { SavedWordsView } from "@/components/words/saved-words-view";

export const metadata = { title: "Mis palabras — Lectura" };

export default function SavedWordsPage() {
  return (
    <>
      <AppHeader title="Mis palabras" />
      <SavedWordsView />
    </>
  );
}
