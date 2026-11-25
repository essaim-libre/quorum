export default function AppLoading() {
  return (
    <main className="quorum-container py-6" aria-busy="true">
      <div className="flex min-h-[56px] items-center justify-between border-b border-rule">
        <div className="quorum-skeleton h-5 w-20 bg-surface" />
        <div className="quorum-skeleton h-3 w-32 bg-surface" />
      </div>

      <div className="pt-8 pb-6">
        <div className="quorum-skeleton h-9 w-48 bg-surface" />
        <div className="mt-4 flex gap-4">
          <div className="quorum-skeleton h-4 w-16 bg-surface" />
          <div className="quorum-skeleton h-4 w-16 bg-surface" />
          <div className="quorum-skeleton h-4 w-12 bg-surface" />
        </div>
      </div>

      <div className="quorum-section-rule flex flex-col gap-6 pt-6">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="quorum-rule flex flex-col gap-3 pt-6 first:border-t-0 first:pt-0"
          >
            <div className="quorum-skeleton h-3 w-36 bg-surface" />
            <div className="quorum-skeleton h-6 w-5/6 bg-surface" />
            <div className="quorum-skeleton h-[2px] w-full bg-surface" />
          </div>
        ))}
      </div>
    </main>
  );
}
