import Scene from "@/components/Scene";
import { Suspense } from "react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between">
      <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading 3D Scene...</div>}>
        <Scene />
      </Suspense>
    </main>
  );
}
