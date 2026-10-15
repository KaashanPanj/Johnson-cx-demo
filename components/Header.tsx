import Image from "next/image";
import Link from "next/link";

// Branding-only header. The Aistra mark is a black icon + purple wordmark, so
// the chrome stays white (it would disappear on navy); brand colour comes from
// the accent line and the controls below.
export default function Header() {
  return (
    <header className="w-full bg-white border-b border-border sticky top-0 z-30">
      <div className="h-1 w-full bg-primary" aria-hidden />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center shrink-0" aria-label="Home">
            <Image
              src="/aistra_logo_full.png"
              alt="Aistra — Better with AI"
              width={160}
              height={58}
              priority
              className="h-9 w-auto"
            />
          </Link>

          <div className="text-right">
            <p className="text-sm font-semibold text-navy leading-tight">
              Johnson Health Tech Australia
            </p>
            <p className="text-xs text-muted-foreground leading-tight">
              Voice AI demo · inbound virtual agents
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
