import { redirect } from 'next/navigation';

export default function LiveRoundStartRedirect() {
  redirect('/rounds/add?mode=live');
}
