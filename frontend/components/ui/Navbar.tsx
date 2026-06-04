"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

interface NavbarProps {
  variant?: "landing" | "back";
}

export function Navbar({ variant = "landing" }: NavbarProps) {
  return (
    <nav className="border-b border-border-faint backdrop-blur-md bg-bg-base/60 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <Image
            src="/logo.png"
            alt=""
            width={50}
            height={50}
            priority
            className="rounded-md"
          />
          <h3 className="text-xl font-semibold tracking-tight text-text-primary">
            Noctcom
          </h3>
        </Link>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {variant === "landing" ? (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Iniciar sesión
                </Button>
              </Link>
              <Link href="/signup">
                <Button
                  variant="primary"
                  size="sm"
                  rightIcon={<ArrowRight className="size-3.5" />}
                >
                  Crear cuenta
                </Button>
              </Link>
            </>
          ) : (
            <Link href="/">
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<ArrowLeft className="size-3.5" />}
              >
                Volver
              </Button>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
