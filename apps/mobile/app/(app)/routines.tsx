import { Redirect } from 'expo-router';

// Routines are a section of Tasks now.
export default function RoutinesLink() {
  return <Redirect href="/tasks?section=routines" />;
}
