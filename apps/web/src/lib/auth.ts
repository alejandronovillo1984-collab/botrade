import { auth } from './firebase';
import { signOut } from 'firebase/auth';

export async function logoutUser(): Promise<void> {
  return signOut(auth);
}
