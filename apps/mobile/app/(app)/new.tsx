import { Redirect } from 'expo-router';
import type { ReactElement } from 'react';

export default function NewRedirect(): ReactElement {
  return <Redirect href="/(app)/(tabs)" />;
}
