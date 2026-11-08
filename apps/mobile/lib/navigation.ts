import { router, type Href } from 'expo-router';

/** Back if there is somewhere to go back to (e.g. not after opening a link directly), else `fallback`. */
export function goBack(fallback: Href = '/'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
