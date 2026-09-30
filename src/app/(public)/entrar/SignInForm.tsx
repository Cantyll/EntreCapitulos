'use client';

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';

import styles from '@/components/auth/auth.module.css';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { OTP_LENGTH, OTP_RESEND_SECONDS } from '@/lib/auth/constants';
import { OTP_ERRORS, type OtpError } from '@/lib/auth/sign-in-errors';

import { sendEmailCode, verifyEmailCode } from './actions';

/**
 * Login por código: e-mail, depois o código de 6 dígitos digitado aqui mesmo. Não depende de
 * link: no app instalado no iPhone, um link do e-mail abriria no Safari, que tem outros cookies.
 * O e-mail fica só na memória deste componente (nada de URL nem storage).
 */
export function SignInForm({ next }: { next: string }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<OtpError | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [pending, startTransition] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const emailId = useId();
  const codeId = useId();
  const codeHintId = useId();

  // Contagem regressiva do reenvio.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  // Ao trocar de passo, o foco vai para o campo novo (na primeira exibição, não: no celular isso
  // abriria o teclado assim que a página carrega).
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    (step === 'code' ? codeRef : emailRef).current?.focus();
  }, [step]);

  function requestCode() {
    setError(null);
    startTransition(async () => {
      const result = await sendEmailCode(email);
      if (result.ok) {
        setCode('');
        setStep('code');
        setSecondsLeft(OTP_RESEND_SECONDS);
      } else {
        setError(result.error);
        if (result.error === 'rate_limited') setSecondsLeft(OTP_RESEND_SECONDS);
      }
    });
  }

  function onSubmitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestCode();
  }

  function onSubmitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== OTP_LENGTH) {
      setError('invalid_code');
      return;
    }
    setError(null);
    startTransition(async () => {
      // Se der certo, a própria action redireciona.
      const result = await verifyEmailCode(email, code, next);
      if (result && !result.ok) setError(result.error);
    });
  }

  function useAnotherEmail() {
    setError(null);
    setCode('');
    setStep('email');
  }

  const errorBox = error && (
    <p id={errorId} className={styles.error} role="alert">
      <Icon name="x" size="sm" />
      {OTP_ERRORS[error]}
    </p>
  );

  if (step === 'email') {
    return (
      <form onSubmit={onSubmitEmail} noValidate>
        {errorBox}
        <div className={styles.field}>
          <label htmlFor={emailId}>E-mail</label>
          <input
            ref={emailRef}
            id={emailId}
            className={styles.input}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="seu@email.com"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={error === 'invalid_email' || undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </div>
        <Button type="submit" block disabled={pending || secondsLeft > 0}>
          {pending
            ? 'Enviando…'
            : secondsLeft > 0
              ? `Aguarde ${secondsLeft} s`
              : 'Receber código por e-mail'}
        </Button>
        <p className={styles.tiny}>Sem senha: mandamos um código de 6 dígitos para o seu e-mail.</p>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmitCode} noValidate>
      <p className={styles.sentTo}>
        Mandamos um código para <b>{email}</b>. Digite aqui mesmo, sem sair desta tela.
      </p>
      {errorBox}
      <div className={styles.field}>
        <label htmlFor={codeId}>Código de {OTP_LENGTH} dígitos</label>
        <input
          ref={codeRef}
          id={codeId}
          className={`${styles.input} ${styles.code}`}
          type="text"
          name="code"
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern={`\\d{${OTP_LENGTH}}`}
          maxLength={OTP_LENGTH}
          required
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
          aria-invalid={error === 'invalid_code' || undefined}
          aria-describedby={[codeHintId, error ? errorId : null].filter(Boolean).join(' ')}
        />
        <small id={codeHintId} className={styles.hint}>
          Não chegou? Confira a caixa de spam ou promoções.
        </small>
      </div>
      <Button type="submit" block disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </Button>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.linkButton}
          onClick={requestCode}
          disabled={pending || secondsLeft > 0}
        >
          {secondsLeft > 0 ? `Reenviar código em ${secondsLeft} s` : 'Reenviar código'}
        </button>
        <button type="button" className={styles.linkButton} onClick={useAnotherEmail}>
          Usar outro e-mail
        </button>
      </div>
    </form>
  );
}
