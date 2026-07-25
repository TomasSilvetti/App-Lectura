import { ReaderScreen } from "@/components/reader/reader-screen";

export default async function ReaderPage({ params }: PageProps<"/leer/[id]">) {
  const { id } = await params;
  return <ReaderScreen id={id} />;
}
