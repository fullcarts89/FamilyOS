import { router } from 'expo-router';

/** Back if there is somewhere to go back to (e.g. not after opening a link directly), else Today. */
export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
