import { notFound, redirect } from "next/navigation";
import { BallotFlow } from "@/components/BallotFlow";
import { getDb } from "@/lib/db/client";
import { getPublishedVoteBySlug } from "@/lib/votes/service";

export const dynamic = "force-dynamic";

export default async function VoteBallotPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getPublishedVoteBySlug(getDb(), slug);
  if (!result) {
    notFound();
  }

  const { vote } = result;
  if (vote.status !== "open") {
    redirect(`/votes/${vote.slug}`);
  }

  return (
    <BallotFlow
      voteId={vote.id}
      slug={vote.slug}
      question={vote.question}
      publicKeySpkiBase64={vote.publicKeySpkiBase64}
      options={vote.options}
    />
  );
}
