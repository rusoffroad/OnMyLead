import type { ReactNode } from 'react';

/**
 * Browser tab title and meta tags for a page. They only mean something on onmylead.com, so on
 * iPhone, iPad and Android this renders nothing.
 *
 * Don't import `expo-router/head` in screens. On iOS its Head builds a Handoff URL and, with no
 * `origin` in the Expo config, pops an "Expo Head: Add the handoff origin" alert on every page
 * that uses it (Help and Support, Contact Us, Terms, Privacy). The web build gets the real Head
 * from page-head.web.tsx.
 */
export default function PageHead(_props: { children?: ReactNode }) {
  return null;
}
