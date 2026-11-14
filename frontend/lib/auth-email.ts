// Email OTP helpers built on top of the Supabase browser client.
import { getSupabase } from "./supabase";

import { storeSession } from "./auth";
import type { User } from "./auth";

export type AuthResult = { ok: boolean; message?: string };

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: "Email sign-up is not configured." };
  const { error } = await sb.auth.signUp({ email, password });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Check your email for a verification code." };
}

export async function verifySignupOtp(email: string, token: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: "Email sign-up is not configured." };
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: "signup" });
  if (error || !data.session) return { ok: false, message: error?.message || "Invalid code." };
  await linkSupabaseSession(data.session.access_token);
  return { ok: true };
}

export async function signInWithEmailOtp(email: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: "Email sign-in is not configured." };
  const { error } = await sb.auth.signInWithOtp({ email });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Check your email for a sign-in code." };
}

export async function verifySignInOtp(email: string, token: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: "Email sign-in is not configured." };
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.session) return { ok: false, message: error?.message || "Invalid code." };
  await linkSupabaseSession(data.session.access_token);
  return { ok: true };
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: "Password reset is not configured." };
  // OTP-based reset: send a sign-in code, then the user sets a new password.
  const { error } = await sb.auth.signInWithOtp({ email });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Check your email for a reset code." };
}

export async function resetPasswordWithOtp(email: string, token: string, newPassword: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: "Password reset is not configured." };
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.session) return { ok: false, message: error?.message || "Invalid code." };
  const { error: updErr } = await sb.auth.updateUser({ password: newPassword });
  if (updErr) return { ok: false, message: updErr.message };
  await linkSupabaseSession(data.session.access_token);
  return { ok: true };
}

export async function changeEmail(newEmail: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: "Email change is not configured." };
  const { error } = await sb.auth.updateUser({ email: newEmail });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Confirmation sent to your new email address." };
}

export async function resendOtp(email: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, message: "Not configured." };
  const { error } = await sb.auth.resend({ type: "signup", email });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Code resent." };
}

async function linkSupabaseSession(accessToken: string): Promise<void> {
  const scanId = (() => {
    try { return sessionStorage.getItem("autofix_oauth_scan_id"); } catch { return null; }
  })();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "https://backend-virid-ten-43.vercel.app";
  const res = await fetch(`${apiBase}/auth/supabase/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken, scan_id: scanId }),
  });
  if (!res.ok) throw new Error("Backend session exchange failed.");
  const data = await res.json();
  storeSession(data.token, data.user as User);
  try { sessionStorage.removeItem("autofix_oauth_scan_id"); } catch { /* ignore */ }
  // Establish httpOnly cookie for /admin gate.
  try {
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: data.token }),
    });
  } catch { /* non-fatal */ }
}
