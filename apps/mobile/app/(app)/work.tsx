import { Redirect } from 'expo-router';

// "All to-dos" now lives in Tasks, by person.
export default function WorkLink() {
  return <Redirect href="/tasks" />;
}
