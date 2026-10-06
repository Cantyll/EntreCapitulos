'use client';

import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/Icon';
import { charCount } from '@/lib/about';

import styles from './aboutEditor.module.css';

/*
 * Peças pequenas do formulário da página Sobre: campo de uma linha, campo de várias linhas, contador, interruptor e
 * os botões de ordem. Tudo controlado (o estado vive no `AboutEditor`) e sem `<form action>`: o React 19 zera os campos
 * de um formulário de action quando ela termina, e aqui o texto precisa ficar na tela.
 */

export function Counter({ value, max }: { value: string; max: number }) {
  const n = charCount(value);
  return (
    <span className={`${styles.counter} ${n > max ? styles.counterOver : ''}`} aria-hidden="true">
      {n}/{max}
    </span>
  );
}

type BaseProps = {
  id: string;
  label: string;
  value: string;
  max: number;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  dataTour?: string;
};

export function TextField({
  id,
  label,
  value,
  max,
  onChange,
  error,
  hint,
  disabled,
  dataTour,
  inputMode,
  onBlur,
}: BaseProps & {
  inputMode?: 'url' | 'text';
  onBlur?: (value: string) => void;
}) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-erro` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={styles.field} data-tour={dataTour}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        <Counter value={value} max={max} />
      </div>
      <input
        id={id}
        className={`${styles.input} ${error ? styles.invalid : ''}`}
        type="text"
        value={value}
        maxLength={max}
        disabled={disabled}
        inputMode={inputMode}
        autoCapitalize={inputMode === 'url' ? 'none' : undefined}
        autoCorrect={inputMode === 'url' ? 'off' : undefined}
        spellCheck={inputMode === 'url' ? false : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur ? (event) => onBlur(event.target.value) : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-erro`} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  value,
  max,
  onChange,
  error,
  hint,
  disabled,
  dataTour,
  rows = 3,
}: BaseProps & { rows?: number }) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-erro` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={styles.field} data-tour={dataTour}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
        <Counter value={value} max={max} />
      </div>
      <textarea
        id={id}
        className={`${styles.textarea} ${error ? styles.invalid : ''}`}
        value={value}
        rows={rows}
        maxLength={max}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-erro`} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Interruptor mostrar/ocultar: um botão role="switch" com o nome visível, num alvo de pelo menos 44px. */
export function SwitchField({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
  dataTour,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  dataTour?: string;
}) {
  return (
    <div className={styles.switchRow} data-tour={dataTour}>
      <div>
        <b id={`${id}-nome`}>{label}</b>
        <small id={`${id}-desc`}>{description}</small>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-nome`}
        aria-describedby={`${id}-desc`}
        className={styles.switch}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

/**
 * Subir, descer e remover um item de uma lista. Funcionam no toque e no teclado (são botões); o nome de cada um diz
 * qual item é. `data-move` serve para devolver o foco ao botão depois de mover (o item troca de lugar na lista).
 */
export function ItemActions({
  noun,
  index,
  count,
  itemKey,
  onMove,
  onRemove,
  canRemove = true,
  disabled,
}: {
  /** "seção", "link": entra no nome acessível dos botões. */
  noun: string;
  index: number;
  count: number;
  itemKey: string;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  canRemove?: boolean;
  disabled?: boolean;
}): ReactNode {
  const n = index + 1;
  return (
    <div className={styles.itemActions}>
      <button
        type="button"
        className={styles.iconBtn}
        data-move={`${itemKey}:up`}
        aria-label={`Subir ${noun} ${n}`}
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
      >
        <Icon name="left" size="sm" className={styles.rotUp} />
      </button>
      <button
        type="button"
        className={styles.iconBtn}
        data-move={`${itemKey}:down`}
        aria-label={`Descer ${noun} ${n}`}
        disabled={disabled || index === count - 1}
        onClick={() => onMove(1)}
      >
        <Icon name="left" size="sm" className={styles.rotDown} />
      </button>
      <button
        type="button"
        className={styles.iconBtn}
        data-danger=""
        aria-label={`Remover ${noun} ${n}`}
        disabled={disabled || !canRemove}
        onClick={onRemove}
      >
        <Icon name="trash" size="sm" />
      </button>
    </div>
  );
}
