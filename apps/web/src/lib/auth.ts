import { auth } from './firebase';
import { signOut } from 'firebase/auth';
import { clearSessionCookie } from './session';

export async function logoutUser(): Promise<void> {
  clearSessionCookie();
  return signOut(auth);
}
