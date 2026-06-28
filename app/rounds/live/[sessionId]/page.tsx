import LiveRoundSessionClient from '@/components/rounds/live/LiveRoundSessionClient';

export default async function LiveRoundSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <LiveRoundSessionClient sessionId={sessionId} />;
}
