import { Footer } from "@/components/footer";

export function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-5">
      <main className="flex-1 py-12">
        <h1 className="font-display text-4xl leading-tight font-bold text-balance">
          Which date should I run my SIP on?
        </h1>
        <p className="mt-4 max-w-[65ch] text-mute-text">
          Fund search arrives in a later build.
        </p>
      </main>
      <Footer />
    </div>
  );
}
