"use client";

// Last-resort error screen. Reassures first: nothing moves without the
// user's wallet, so a crash here can't have sent anything.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="container">
      <div className="panel">
        <h1>Something went wrong</h1>
        <p className="sub">
          No funds were moved — nothing is sent without your wallet asking you
          first. Reload and try again.
        </p>
        <button onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
