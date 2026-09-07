'use client';
export default function ErrorView({ reset }: { reset: () => void }) {
  return (
    <main className="prose">
      <h1>Record unavailable</h1>
      <p>
        The service could not load this record. This does not mean it was
        deleted or that no findings exist.
      </p>
      <button onClick={reset}>Try loading again</button>
    </main>
  );
}
