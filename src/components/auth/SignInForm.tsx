'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import {
  sendCode,
  signInWithGoogle,
  verifyCode,
  type SendCodeState,
  type VerifyCodeState,
} from '@/app/(public)/entrar/actions';
import { Button } from '@/components/ui/Button';
import { OTP_LENGTH, OTP_RESEND_SECONDS } from '@/lib/auth/constants';
import { OTP_MESSAGES } from '@/lib/auth/messages';

import styles from './auth.module.css';
import { GoogleIcon } from './GoogleIcon';
import { Turnstile } from './Turnstile';

type SignInFormProps = {
  /** Destino depois do login, já validado no servidor. */
  next: string;
  /** Mensagem (da lista fixa) vinda de `?erro=`; nunca o valor cru da URL. */
  initialError: string | null;
  /** Mostra "Continuar com Google". Desligado por padrão (ver `isGoogleLoginEnabled`). */
  googleEnabled?: boolean;
  /** Site Key do Turnstile (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`). Ausente: tudo funciona como antes. */
  turnstileSiteKey?: string | null;
};

const INITIAL_SEND: SendCodeState = { sent: false, email: '', sentAt: null, error: null };
const INITIAL_VERIFY: VerifyCodeState = { error: null };

export function SignInForm({
  next,
  initialError,
  googleEnabled = false,
  turnstileSiteKey = null,
}: SignInFormProps) {
  const [sendState, sendAction, sending] = useActionState(sendCode, INITIAL_SEND);
  const [verifyState, verifyAction, verifying] = useActionState(verifyCode, INITIAL_VERIFY);
  // "Usar outro e-mail": guarda de qual envio a pessoa voltou, sem precisar de um efeito.
  const [backedFrom, setBackedFrom] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const codeRef = useRef<HTMLInputElement>(null);
  // Com o Turnstile ligado, só dá para enviar depois de passar na verificação (ver `Turnstile`).
  const [captchaReady, setCaptchaReady] = useState(turnstileSiteKey === null);
  const captchaOk = turnstileSiteKey === null || captchaReady;

  const showCode = sendState.sent && backedFrom !== sendState.sentAt;
  const sentAt = sendState.sentAt;

  useEffect(() => {
    if (!showCode) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [showCode, sentAt]);

  useEffect(() => {
    if (showCode) codeRef.current?.focus();
  }, [showCode, sentAt]);

  const remaining =
    sentAt === null
      ? 0
      : Math.min(
          OTP_RESEND_SECONDS,
          Math.max(0, OTP_RESEND_SECONDS - Math.floor((now - sentAt) / 1000)),
        );

  const errorKey = showCode ? (verifyState.error ?? sendState.error) : sendState.error;
  const errorMessage = errorKey ? OTP_MESSAGES[errorKey] : showCode ? null : initialError;

  return (
    <div className={styles.card}>
      <div className={styles.stack}>
        {errorMessage && (
          <p role="alert" className={styles.error}>
            {errorMessage}
          </p>
        )}

        {showCode ? (
          <>
            <p className={styles.lead}>
              Enviamos um código de {OTP_LENGTH} números para <b>{sendState.email}</b>. Digite-o
              abaixo.
            </p>
            <form action={verifyAction} className={styles.stack}>
              <input type="hidden" name="email" value={sendState.email} />
              <input type="hidden" name="next" value={next} />
              <div className={styles.field}>
                <label htmlFor="codigo">Código de {OTP_LENGTH} dígitos</label>
                <input
                  ref={codeRef}
                  id="codigo"
                  name="token"
                  className={`${styles.input} ${styles.code}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  required
                />
              </div>
              <Button type="submit" block disabled={verifying}>
                {verifying ? 'Entrando…' : 'Entrar'}
              </Button>
            </form>
            <div className={styles.row}>
              <form action={sendAction}>
                <input type="hidden" name="email" value={sendState.email} />
                {turnstileSiteKey && (
                  <Turnstile
                    siteKey={turnstileSiteKey}
                    resetKey={sendState}
                    onReadyChange={setCaptchaReady}
                  />
                )}
                <button
                  type="submit"
                  className={styles.linkBtn}
                  disabled={remaining > 0 || sending || !captchaOk}
                >
                  {remaining > 0 ? `Reenviar código em ${remaining} s` : 'Reenviar código'}
                </button>
              </form>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => setBackedFrom(sentAt)}
              >
                Usar outro e-mail
              </button>
            </div>
          </>
        ) : (
          <>
            {googleEnabled && (
              <>
                <form action={signInWithGoogle}>
                  <input type="hidden" name="next" value={next} />
                  <Button type="submit" variant="ghost" block>
                    <GoogleIcon className={styles.google} />
                    Continuar com Google
                  </Button>
                </form>
                <div className={styles.or}>ou</div>
              </>
            )}
            <form action={sendAction} className={styles.stack}>
              <div className={styles.field}>
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  name="email"
                  className={styles.input}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="seu@email.com"
                  defaultValue={sendState.email}
                  required
                />
              </div>
              {turnstileSiteKey && (
                <Turnstile
                  siteKey={turnstileSiteKey}
                  resetKey={sendState}
                  onReadyChange={setCaptchaReady}
                />
              )}
              <Button type="submit" block disabled={sending || !captchaOk}>
                {sending ? 'Enviando…' : 'Receber código por e-mail'}
              </Button>
              <p className={styles.note}>
                Sem senha: mandamos um código de {OTP_LENGTH} números para o seu e-mail.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
