import { notFound } from "next/navigation";
import { VotedReceiptView } from "@/components/VotedReceiptView";
import { formatDateTimeParis } from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { getPublishedVoteBySlug } from "@/lib/votes/service";

export const dynamic = "force-dynamic";

export default async function VoteVotedPage({
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
  return (
    <VotedReceiptView
      voteId={vote.id}
      slug={vote.slug}
      question={vote.question}
      closesAtLabel={formatDateTimeParis(vote.closesAt)}
      isOpen={vote.status === "open"}
    />
  );
}
