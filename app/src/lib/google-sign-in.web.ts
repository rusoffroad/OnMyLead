/** The website signs in with Google through the browser flow (signInWithProvider). */
export const nativeGoogleReady = false;

export async function signInWithGoogleNative(): Promise<'signed_in' | 'cancelled'> {
  throw new Error('Google sign-in on the website uses the browser flow.');
}
