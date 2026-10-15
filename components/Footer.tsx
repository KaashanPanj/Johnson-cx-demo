import Image from "next/image";

export default function Footer() {
  return (
    <footer className="w-full border-t border-border bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-6 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm text-muted-foreground">A product of</span>
            <Image
              src="/aistra_logo.svg"
              alt="Aistra Logo"
              width={80}
              height={24}
              className="h-6 w-auto"
            />
          </div>
        </div>
      </div>
    </footer>
  );
}
