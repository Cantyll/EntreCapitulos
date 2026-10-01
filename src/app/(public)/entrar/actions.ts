'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  NEXT_COOKIE,
  NEXT_COOKIE_MAX_AGE,
  NEXT_COOKIE_PATH,
  OTP_LENGTH,
} from '@/lib/auth/constants';
import {
  classifyOtpSendError,
  classifyOtpVerifyError,
  type OtpErrorKey,
} from '@/lib/auth/messages';
import { isGoogleLoginEnabled } from '@/lib/auth/features';
import { logAuthFailure } from '@/lib/auth/log';
import { redirectTo } from '@/lib/auth/redirect';
import { migrateVisitorProgress } from '@/lib/public/progress';
import { isNameConfirmed } from '@/lib/auth/session';
import { postLoginDestination, safeNext } from '@/lib/auth/safe-next';
import { createClient } from '@/lib/supabase/server';

/*
 * Login por código de 6 dígitos (sem link, porque o app instalado no iPhone tem cookies próprios)
 * e pelo Google. Tudo roda no servidor. Nada aqui registra e-mail, código ou token: toda falha
 * passa por `logAuthFailure`, que só deixa sair nome, status e code do erro.
 */

export type SendCodeState = {
  sent: boolean;
  email: string;
  sentAt: number | null;
  error: OtpErrorKey | null;
};

export type VerifyCodeState = { error: OtpErrorKey | null };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readEmail(formData: FormData): string | null {
  const value = formData.get('email');
  if (typeof value !== 'string') return null;
  const email = value.trim();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

export async function sendCode(_prev: SendCodeState, formData: FormData): Promise<SendCodeState> {
  const email = readEmail(formData);
  const typed = typeof formData.get('email') === 'string' ? String(formData.get('email')) : '';
  if (!email) return { sent: false, email: typed, sentAt: null, error: 'email_invalid' };

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) {
      logAuthFailure('auth.signInWithOtp', error);
      return { sent: false, email, sentAt: null, error: classifyOtpSendError(error) };
    }
  } catch (error) {
    // Variável de ambiente errada, rede fora do ar…: a pessoa vê o aviso, não uma página de erro.
    logAuthFailure('auth.signInWithOtp', error);
    return { sent: false, email, sentAt: null, error: 'send_failed' };
  }
  return { sent: true, email, sentAt: Date.now(), error: null };
}

export async function verifyCode(
  _prev: VerifyCodeState,
  formData: FormData,
): Promise<VerifyCodeState> {
  const email = readEmail(formData);
  const token = formData.get('token');
  if (!email) return { error: 'email_invalid' };
  if (typeof token !== 'string' || !new RegExp(`^\\d{${OTP_LENGTH}}$`).test(token.trim())) {
    return { error: 'code_format' };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  let userId: string;
  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: token.trim(),
      type: 'email',
    });
    if (error || !data.user) {
      if (error) logAuthFailure('auth.verifyOtp', error);
      return { error: error ? classifyOtpVerifyError(error) : 'generic' };
    }
    userId = data.user.id;
  } catch (error) {
    logAuthFailure('auth.verifyOtp', error);
    return { error: 'verify_failed' };
  }

  // O progresso de leitura que a pessoa tinha como visitante passa para a conta (nunca falha o login).
  await migrateVisitorProgress(userId, supabase);
  const confirmed = await isNameConfirmed(userId, supabase);
  redirectTo(postLoginDestination(formData.get('next'), confirmed));
}

/** Endereço público do site, para o retorno do Google. O Supabase só aceita o que estiver nas Redirect URLs. */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const local = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const proto = h.get('x-forwarded-proto') ?? (local ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function signInWithGoogle(formData: FormData) {
  // A interface esconde o botão, mas a ação também recusa: quem a chamasse direto não passa.
  if (!isGoogleLoginEnabled()) redirect('/entrar?erro=oauth');

  const next = safeNext(formData.get('next'));

  // O destino vai num cookie, não na URL de retorno: assim a Redirect URL cadastrada no Supabase
  // pode ser exatamente /auth/callback. SameSite=Lax (Strict perderia o cookie na volta do Google).
  const cookieStore = await cookies();
  cookieStore.set(NEXT_COOKIE, next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: NEXT_COOKIE_PATH,
    maxAge: NEXT_COOKIE_MAX_AGE,
  });

  let url: string | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${await siteOrigin()}/auth/callback` },
    });
    if (error) logAuthFailure('auth.signInWithOAuth', error);
    url = data.url;
  } catch (error) {
    logAuthFailure('auth.signInWithOAuth', error);
  }

  if (!url) redirect('/entrar?erro=oauth');
  redirectTo(url);
}
