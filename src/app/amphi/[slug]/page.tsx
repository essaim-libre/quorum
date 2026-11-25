import { notFound } from "next/navigation";
import { AmphiDisplay } from "@/components/AmphiDisplay";
import { getDb } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { buildQrSvgData } from "@/lib/qr";
import { getPublishedVoteBySlug } from "@/lib/votes/service";

export const dynamic = "force-dynamic";

export default async function AmphiVotePage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getPublishedVoteBySlug(getDb(), slug);
  if (!result) {
    notFound();
  }

  const { vote, serverNow } = result;
  const baseUrl = getEnv().APP_URL.replace(/\/+$/, "");
  const voteUrl = `${baseUrl}/votes/${vote.slug}`;
  const qr = buildQrSvgData(voteUrl);

  return (
    <AmphiDisplay
      slug={vote.slug}
      question={vote.question}
      originDetail={vote.originDetail}
      statusNote={vote.statusNote}
      opensAt={vote.opensAt}
      closesAt={vote.closesAt}
      serverNow={serverNow}
      keyFingerprint={vote.keyFingerprint}
      initialParticipation={vote.participation}
      voteUrl={voteUrl}
      qrViewBoxSize={qr.viewBoxSize}
      qrPathData={qr.pathData}
    />
  );
}
