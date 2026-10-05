'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { showMemberContact } from '@/app/painel/membros/actions';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
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
 * navegador não trazer o e-mail de volta. Cada clique que lê é registrado na auditoria; esconder e mostrar de novo
 * sem sair daqui não consulta (nem registra) outra vez.
 */
export function ContactReveal({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'hidden' });
  const [pending, startTransition] = useTransition();

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
      const result = await showMemberContact(memberId);
      if (result.ok) {
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
    });
  }

  return (
    <div data-tour="member-show-email">
      {state.status === 'shown' ? (
        <div className={styles.revealed}>
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
            <Button variant="ghost" size="sm" onClick={() => setState({ status: 'hidden' })}>
              <Icon name="eyeOff" size="sm" />
              Ocultar e-mail
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.fieldRow}>
          <Button
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
