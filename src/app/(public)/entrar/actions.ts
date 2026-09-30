'use server';

import type { Route } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  OAUTH_CALLBACK_PATH,
  OAUTH_NEXT_COOKIE,
  OAUTH_NEXT_COOKIE_OPTIONS,
  OTP_LENGTH,
} from '@/lib/auth/constants';
import { postSignInPath, safeNext } from '@/lib/auth/safe-next';
import { readProfile } from '@/lib/auth/session';
import { otpErrorFromAuthCode, type OtpError } from '@/lib/auth/sign-in-errors';
import { createClient } from '@/lib/supabase/server';

export type OtpResult = { ok: true } | { ok: false; error: OtpError };

// Nada de e-mail, código ou token nos logs: só o código do erro e o status.
function logAuthError(step: string, error: { code?: string; status?: number }) {
  console.warn(`[auth] ${step}`, { code: error.code, status: error.status });
}

function parseEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  return email;
}

/** Passo 1: manda o código de 6 dígitos para o e-mail (cria a conta se ainda não existir). */
export async function sendEmailCode(emailInput: string): Promise<OtpResult> {
  const email = parseEmail(emailInput);
  if (!email) return { ok: false, error: 'invalid_email' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) {
    logAuthError('signInWithOtp', error);
    return { ok: false, error: otpErrorFromAuthCode(error.code, 'send') };
  }
  return { ok: true };
}

/** Passo 2: confere o código. Deu certo: grava a sessão em cookie e segue para `next`. */
export async function verifyEmailCode(
  emailInput: string,
  tokenInput: string,
  nextInput: string,
): Promise<OtpResult> {
  const email = parseEmail(emailInput);
  if (!email) return { ok: false, error: 'invalid_email' };
  const token = typeof tokenInput === 'string' ? tokenInput.replace(/\D/g, '') : '';
  if (token.length !== OTP_LENGTH) return { ok: false, error: 'invalid_code' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error || !data.user) {
    if (error) logAuthError('verifyOtp', error);
    return {
      ok: false,
      error: error ? otpErrorFromAuthCode(error.code, 'verify') : 'invalid_code',
    };
  }

  const profile = await readProfile(supabase, data.user.id);
  redirect(postSignInPath(safeNext(nextInput), profile?.nameConfirmed ?? false));
}

async function requestOrigin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  return host ? `${proto}://${host}` : null;
}

/**
 * Entrar com o Google. É um formulário comum, então funciona sem JavaScript. O `next` vai num
 * cookie httpOnly de 10 minutos (restrito a /auth/callback), e não na URL de retorno.
 */
export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(formData.get('next'));
  const origin = await requestOrigin();
  if (!origin) redirect('/entrar?erro=indisponivel');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}${OAUTH_CALLBACK_PATH}` },
  });
  if (error || !data.url) {
    if (error) logAuthError('signInWithOAuth', error);
    redirect('/entrar?erro=google');
  }

  (await cookies()).set(OAUTH_NEXT_COOKIE, next, OAUTH_NEXT_COOKIE_OPTIONS);
  // URL do Supabase Auth, que segue para o Google (fora do app, de propósito).
  redirect(data.url as Route);
}
