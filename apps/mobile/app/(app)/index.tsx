import { Redirect } from 'expo-router';
import type { ReactElement } from 'react';

export default function IndexRedirect(): ReactElement {
  return <Redirect href="/(app)/(tabs)" />;
}
