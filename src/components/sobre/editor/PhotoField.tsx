'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ABOUT_LIMITS, sitePhotoUrl, type AboutPhoto } from '@/lib/about';

import styles from './aboutEditor.module.css';
import { Counter } from './fields';
import { uploadAboutPhoto, validatePhotoFile } from './upload-photo';

/*
 * Foto da autora (opcional). Envia direto ao Storage e o servidor processa (recorte quadrado automático de 512x512,
 * WebP, sem metadados). O texto alternativo é OBRIGATÓRIO: sem foto, as iniciais continuam. A foto nova só entra no
 * conteúdo da página quando se salva o rascunho; só vai ao ar quando se publica.
 */
export function PhotoField({
  photo,
  onChange,
  onBusyChange,
  altError,
  disabled,
}: {
  photo: AboutPhoto | null;
  onChange: (photo: AboutPhoto | null) => void;
  onBusyChange: (busy: boolean) => void;
  altError?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const altRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLButtonElement>(null);
  const focusAltWhenReady = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const url = photo ? sitePhotoUrl(photo.path) : null;

  // Depois do envio, o foco vai para o texto alternativo, mas só quando o campo já existe na tela (a foto nova chega
  // pelo pai, depois do envio): um `requestAnimationFrame` corria contra essa renderização.
  useEffect(() => {
    if (!focusAltWhenReady.current || !photo) return;
    focusAltWhenReady.current = false;
    altRef.current?.focus();
  }, [photo]);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!file) return;
    const invalid = validatePhotoFile(file);
    if (invalid) return setNotice({ kind: 'error', text: invalid });

    setNotice(null);
    setBusy(true);
    onBusyChange(true);
    try {
      const result = await uploadAboutPhoto(file);
      if (result.ok) {
        // O texto alternativo da foto ANTERIOR descreve outra imagem: começa vazio e a pessoa escreve o novo.
        focusAltWhenReady.current = true;
        onChange({ path: result.path, alt: '' });
        setNotice({
          kind: 'ok',
          text: 'Foto pronta. Descreva a foto no texto alternativo e salve o rascunho.',
        });
      } else setNotice({ kind: 'error', text: result.message });
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  const altId = `${id}-alt`;
  return (
    <div className={styles.field} data-tour="about-photo">
      <span className={styles.label}>Foto da autora (opcional)</span>
      <div className={styles.photoRow}>
        {url ? (
          <Image
            src={url}
            alt=""
            width={96}
            height={96}
            unoptimized
            className={styles.photoThumb}
          />
        ) : (
          <div className={styles.photoEmpty} aria-hidden="true">
            Sem foto: iniciais
          </div>
        )}
        <div className={styles.photoActions}>
          <input
            ref={inputRef}
            id={`${id}-arquivo`}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className={styles.fileInput}
            onChange={onFile}
            disabled={disabled || busy}
            aria-label="Escolher o arquivo da foto da autora"
            tabIndex={-1}
          />
          <Button
            ref={uploadRef}
            variant="ghost"
            size="sm"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="upload" size="sm" />
            {busy ? 'Enviando…' : photo ? 'Trocar foto' : 'Enviar foto'}
          </Button>
          {photo && (
            <Button
              variant="ghost"
              size="sm"
              danger
              disabled={disabled || busy}
              onClick={() => {
                onChange(null);
                setNotice({ kind: 'ok', text: 'Foto removida.' });
                // O botão "Remover foto" sai da tela: o foco vai para o "Enviar foto", que fica no mesmo lugar.
                uploadRef.current?.focus();
              }}
            >
              <Icon name="trash" size="sm" />
              Remover foto
            </Button>
          )}
        </div>
      </div>
      <p className={styles.hint}>
        PNG, JPG ou WEBP de até 5 MB. O recorte é automático e quadrado; envie uma foto já
        enquadrada em quadrado para controlar o enquadramento. Os metadados da foto (como a
        localização) são removidos.
      </p>
      {photo && (
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label className={styles.label} htmlFor={altId}>
              Texto alternativo da foto (obrigatório)
            </label>
            <Counter value={photo.alt} max={ABOUT_LIMITS.photoAlt} />
          </div>
          <input
            ref={altRef}
            id={altId}
            className={`${styles.input} ${altError ? styles.invalid : ''}`}
            type="text"
            value={photo.alt}
            maxLength={ABOUT_LIMITS.photoAlt}
            disabled={disabled}
            aria-invalid={altError ? true : undefined}
            aria-describedby={altError ? `${altId}-erro` : undefined}
            onChange={(event) => onChange({ ...photo, alt: event.target.value })}
          />
          {altError && (
            <p id={`${altId}-erro`} className={styles.fieldError}>
              {altError}
            </p>
          )}
        </div>
      )}
      <p
        role={notice?.kind === 'error' ? 'alert' : 'status'}
        className={notice?.kind === 'error' ? styles.fieldError : styles.hint}
      >
        {busy ? 'Enviando e processando a foto…' : notice?.text}
      </p>
    </div>
  );
}
