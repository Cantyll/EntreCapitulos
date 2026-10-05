'use client';

import { useActionState, useId } from 'react';

import { searchMembers, type SearchState } from '@/app/painel/membros/actions';
import { Button } from '@/components/ui/Button';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import { MEMBER_SEARCH_MAX, type MemberFilter } from '@/lib/members';

import styles from './members.module.css';

const IDLE: SearchState = { status: 'idle' };

/**
 * Uma caixa só: nome (prefixo) ou e-mail exato. Vai por POST (Server Action): um texto com "@" é e-mail e leva
 * direto ao perfil, SEM nunca entrar na URL nem no log; o resto vira `?busca=` (nomes são públicos). Os
 * campos não ficam preenchidos depois de uma busca por e-mail (o React 19 os zera), o que é desejado.
 */
export function MembersSearch({ search, filter }: { search: string; filter: MemberFilter }) {
  const [state, formAction, pending] = useActionState(searchMembers, IDLE);
  const inputId = useId();
  const hintId = useId();

  return (
    <form action={formAction} className={styles.search} role="search" data-tour="members-search">
      <input type="hidden" name="filtro" value={filter} />
      <label htmlFor={inputId}>
        <VisuallyHidden>Buscar por nome ou por e-mail exato</VisuallyHidden>
        <input
          id={inputId}
          name="q"
          type="text"
          defaultValue={search}
          placeholder="Buscar por nome ou e-mail exato"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={320}
          aria-describedby={hintId}
        />
      </label>
      <Button type="submit" size="sm" disabled={pending} aria-busy={pending || undefined}>
        {pending ? 'Buscando…' : 'Buscar'}
      </Button>
      <p id={hintId} className={styles.hint}>
        Nome: o começo do nome (até {MEMBER_SEARCH_MAX} letras). E-mail: o endereço completo; abre
        direto o perfil.
      </p>
      {state.status === 'error' && (
        <p role="alert" className={styles.noticeError} style={{ flexBasis: '100%' }}>
          {state.message}
        </p>
      )}
    </form>
  );
}
