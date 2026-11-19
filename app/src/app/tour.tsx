import { router, Stack } from 'expo-router';

import { TourPager } from '@/components/welcome-tour';

/**
 * You > Help > Take the Tour: the Welcome Tour (components/welcome-tour.tsx) again, from the first
 * card, for anyone, whatever Admin > Features > Welcome Tour says. Skip and Let's Ride go back.
 */
export default function TakeTheTour() {
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <TourPager mode="tour" onClose={close} />
    </>
  );
}
