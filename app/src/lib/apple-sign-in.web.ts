/** The website signs in with Apple through the browser flow (signInWithProvider), not this. */
export async function signInWithApple(): Promise<'signed_in' | 'cancelled'> {
  throw new Error('Sign in with Apple works in the iPhone app.');
}
