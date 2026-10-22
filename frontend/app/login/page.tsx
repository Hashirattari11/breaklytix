import type { Metadata } from "next";
import LoginClient from "../../components/LoginClient";
import { SITE_URL } from "../../lib/site";

export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to Breaklytix with your GitHub account to monitor the APIs your repos depend on.",
  // Noindex (inherited from the root layout) but still canonicalised: the page
  // is reachable at /login only, and an explicit canonical removes the "no
  // canonical declared" warning without changing indexation.
  alternates: { canonical: `${SITE_URL}/login` },
};

export default function LoginPage() {
  return <LoginClient />;
}