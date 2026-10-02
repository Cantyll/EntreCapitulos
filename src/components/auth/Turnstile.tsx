'use client';

import { useEffect, useRef, useState } from 'react';

import styles from './auth.module.css';

/*
 * Cloudflare Turnstile (verificação de que quem pede o código é uma pessoa). Só é montado quando existe
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; sem a chave o login nem carrega nada da Cloudflare.
 *
 * O widget é renderizado dentro do <form> e, quando a pessoa passa na verificação, o Turnstile escreve o
 * token num <input type="hidden" name="cf-turnstile-response"> dessa mesma <form>: a Server Action só lê
 * o campo. O token vale UMA vez, então o widget é reiniciado a cada tentativa (`resetKey` muda).
 *
 * Carregamos o script por aqui (criado por um script já confiável, o que a CSP com 'strict-dynamic'
 * aceita). O nonce da página, se houver, vai junto: a Cloudflare o propaga aos recursos que ela carrega.
 */

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
    if (nonce) script.nonce = nonce;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile_missing'));
    script.onerror = () => reject(new Error('turnstile_script_failed'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    // Permite tentar de novo (a rede pode voltar) em vez de guardar a falha para sempre.
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

type Props = {
  siteKey: string;
  /** Muda a cada tentativa de envio: o widget é reiniciado (o token anterior já foi usado). */
  resetKey?: unknown;
  /** `true` quando há um token válido; `false` ao reiniciar, expirar ou falhar. */
  onReadyChange: (ready: boolean) => void;
};

export function Turnstile({ siteKey, resetKey, onReadyChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const apiRef = useRef<TurnstileApi | null>(null);
  const readyRef = useRef(onReadyChange);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    readyRef.current = onReadyChange;
  }, [onReadyChange]);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    readyRef.current(false);
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container) return;
        apiRef.current = api;
        widgetRef.current = api.render(container, {
          sitekey: siteKey,
          language: 'pt-br',
          callback: () => readyRef.current(true),
          'expired-callback': () => readyRef.current(false),
          'error-callback': () => {
            readyRef.current(false);
            setFailed(true);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      readyRef.current(false);
      if (widgetRef.current && apiRef.current) {
        try {
          apiRef.current.remove(widgetRef.current);
        } catch {
          // O widget já saiu da página.
        }
      }
      widgetRef.current = null;
    };
  }, [siteKey]);

  // Cada tentativa gasta o token: pede um novo (pula a primeira renderização).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    readyRef.current(false);
    setFailed(false);
    if (widgetRef.current && apiRef.current) apiRef.current.reset(widgetRef.current);
  }, [resetKey]);

  return (
    <div className={styles.captcha}>
      <div ref={containerRef} />
      {failed && (
        <p role="alert" className={styles.error}>
          Não conseguimos carregar a verificação de segurança. Recarregue a página e tente de novo.
        </p>
      )}
    </div>
  );
}
