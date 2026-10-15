import { Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HomeClient from "@/components/HomeClient";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="container mx-auto flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <HomeClient />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
