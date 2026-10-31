import { Redirect } from 'expo-router';
import type { ReactElement } from 'react';
import { useAuth, isAdmin } from '../../src/auth/AuthContext';

export default function IndexRedirect(): ReactElement {
  const { user } = useAuth();

  if (isAdmin(user)) {
    return <Redirect href="/(app)/admin/(tabs)/dashboard" />;
  }

  return <Redirect href="/(app)/(tabs)" />;
}
