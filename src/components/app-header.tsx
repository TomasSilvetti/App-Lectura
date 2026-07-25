"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Settings, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppHeader({ title }: { title?: string }) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-1 px-3 sm:px-5">
        {isHome ? (
          <Link href="/" className="font-heading mr-auto text-lg font-semibold">
            Lectura
          </Link>
        ) : (
          <>
            <Button variant="ghost" size="icon" asChild aria-label="Volver">
              <Link href="/">
                <ArrowLeft className="size-5" />
              </Link>
            </Button>
            <span className="font-heading mr-auto truncate text-base font-medium">
              {title}
            </span>
          </>
        )}

        <Button variant="ghost" size="icon" asChild aria-label="Mis palabras">
          <Link href="/mis-palabras">
            <Star className="size-5" />
          </Link>
        </Button>
        <Button variant="ghost" size="icon" asChild aria-label="Ajustes">
          <Link href="/ajustes">
            <Settings className="size-5" />
          </Link>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
