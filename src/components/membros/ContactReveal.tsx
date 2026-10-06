'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { showMemberContact } from '@/app/painel/membros/actions';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { logFailure } from '@/lib/auth/log';
import { MEMBER_MESSAGES } from '@/lib/members/errors';
import { formatDateTime } from '@/lib/site';

import styles from './members.module.css';

type Shown = { email: string | null; lastSignInAt: string | null; providers: string[] };

type State =
  { status: 'hidden' } | { status: 'shown'; contact: Shown } | { status: 'error'; message: string };

const PROVIDER_LABELS: Record<string, string> = {
  email: 'Código por e-mail',
  google: 'Google',
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? (/^[a-z0-9_-]{1,30}$/i.test(provider) ? provider : 'Outro');
}

/**
 * "Mostrar e-mail": o e-mail, o último acesso e o provedor de UMA pessoa, sob demanda. O dado vive SÓ no estado
 * deste componente: não vai para a URL, cookie, `localStorage`, `sessionStorage`, nem para o cache do Next, e não
 * está nos dados que o servidor envia ao abrir a página. Some ao navegar (o componente é desmontado) e também
 * quando a página vai para o histórico (`pagehide`) ou volta dele (`pageshow`), para a cópia restaurada pelo
 * navegador não trazer o e-mail de volta. Cada vez que o e-mail é mostrado é uma consulta nova: ela é registrada
 * na auditoria (esconder e mostrar de novo registra de novo, de propósito).
 *
 * Foco: o botão que a pessoa acionou sai da tela quando o estado muda, e o foco cairia no `<body>`. Depois de
 * mostrar, o foco vai para o bloco com os dados (que tem nome acessível, então o leitor de tela o lê); depois de
 * ocultar, volta para "Mostrar e-mail".
 */
export function ContactReveal({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'hidden' });
  const [pending, startTransition] = useTransition();
  const revealedRef = useRef<HTMLDivElement>(null);
  const showRef = useRef<HTMLButtonElement>(null);
  const focusAfterChange = useRef<'revealed' | 'show' | null>(null);

  // Roda de novo quando `pending` muda: ao ocultar logo depois de mostrar, a consulta anterior (e o refresh da
  // auditoria) ainda pode estar pendente e o botão nasce desabilitado, e `focus()` num botão desabilitado não faz
  // nada. O pedido de foco só é consumido quando o foco chega.
  useEffect(() => {
    const target = focusAfterChange.current;
    if (target === 'revealed' && revealedRef.current) {
      revealedRef.current.focus();
      focusAfterChange.current = null;
    } else if (target === 'show' && showRef.current && !showRef.current.disabled) {
      showRef.current.focus();
      focusAfterChange.current = null;
    }
  }, [state.status, pending]);

  useEffect(() => {
    const hide = () =>
      setState((current) => (current.status === 'shown' ? { status: 'hidden' } : current));
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) hide();
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  function reveal() {
    startTransition(async () => {
      try {
        const result = await showMemberContact(memberId);
        if (result.ok) {
          focusAfterChange.current = 'revealed';
          setState({
            status: 'shown',
            contact: {
              email: result.email,
              lastSignInAt: result.lastSignInAt,
              providers: result.providers,
            },
          });
          // A consulta entrou na auditoria: atualiza a lista da página (o e-mail não faz parte dela).
          router.refresh();
        } else {
          setState({ status: 'error', message: result.message });
        }
      } catch (failure) {
        // Chamada cortada (sem rede): aviso no lugar, em vez de a página ir para a tela de erro.
        logFailure('membros: mostrar e-mail', failure);
        setState({ status: 'error', message: MEMBER_MESSAGES.network });
      }
    });
  }

  function hideAgain() {
    focusAfterChange.current = 'show';
    setState({ status: 'hidden' });
  }

  return (
    <div data-tour="member-show-email">
      {state.status === 'shown' ? (
        <div
          ref={revealedRef}
          className={styles.revealed}
          role="group"
          aria-label="Dados de contato da pessoa"
          tabIndex={-1}
        >
          <dl>
            <dt>E-mail</dt>
            <dd>{state.contact.email ?? 'sem e-mail'}</dd>
            <dt>Último acesso</dt>
            <dd>
              {state.contact.lastSignInAt
                ? formatDateTime(state.contact.lastSignInAt)
                : 'nunca entrou'}
            </dd>
            <dt>Entra com</dt>
            <dd>
              {state.contact.providers.length > 0
                ? state.contact.providers.map(providerLabel).join(', ')
                : 'não informado'}
            </dd>
          </dl>
          <div>
            <Button variant="ghost" size="sm" onClick={hideAgain}>
              <Icon name="eyeOff" size="sm" />
              Ocultar e-mail
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.fieldRow}>
          <Button
            ref={showRef}
            variant="soft"
            size="sm"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={reveal}
          >
            <Icon name="eye" size="sm" />
            {pending ? 'Buscando…' : 'Mostrar e-mail'}
          </Button>
          <span className={styles.hint}>Cada consulta fica registrada na auditoria.</span>
        </div>
      )}
      <div role="status" aria-live="polite">
        {state.status === 'error' && <p className={styles.noticeError}>{state.message}</p>}
      </div>
    </div>
  );
}
