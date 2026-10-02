'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

import styles from './books.module.css';
import { uploadCover, validateCoverFile } from './upload-cover';

type CoverUploaderProps = {
  bookId: string;
  /** Texto do botão. */
  label?: string;
  /** O tema automático está ligado? Muda a mensagem de sucesso. */
  themeAuto?: boolean;
};

type Notice = { kind: 'ok' | 'error'; text: string } | null;

/** Botão "Trocar capa": valida, envia direto ao Storage, finaliza no servidor e atualiza a página. */
export function CoverUploader({
  bookId,
  label = 'Trocar capa',
  themeAuto = true,
}: CoverUploaderProps) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!file) return;

    const invalid = validateCoverFile(file);
    if (invalid) {
      setNotice({ kind: 'error', text: invalid });
      return;
    }

    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setNotice(null);

    startTransition(async () => {
      const result = await uploadCover(bookId, file);
      if (result.ok) {
        setNotice({
          kind: 'ok',
          text:
            result.theme === 'applied'
              ? themeAuto
                ? 'Capa trocada e tema atualizado.'
                : 'Capa trocada. Ligue o tema automático para usar as cores dela.'
              : 'Capa trocada. Não encontrei cores suficientes, mantive o tema padrão.',
        });
        router.refresh();
      } else {
        setNotice({ kind: 'error', text: result.message });
      }
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    });
  }

  return (
    <div className={styles.uploader}>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className={styles.fileInput}
        onChange={onChange}
        disabled={pending}
        aria-label="Escolher o arquivo da capa"
        aria-describedby={`${inputId}-status`}
      />
      <Button
        variant="ghost"
        size="sm"
        block
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        <Icon name="upload" size="sm" />
        {pending ? 'Enviando…' : label}
      </Button>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:), não passa pelo otimizador
        <img src={preview} alt="Prévia da capa escolhida" className={styles.preview} />
      )}
      <p
        id={`${inputId}-status`}
        role={notice?.kind === 'error' ? 'alert' : 'status'}
        className={notice?.kind === 'error' ? styles.error : styles.ok}
      >
        {pending ? 'Enviando e processando a capa…' : notice?.text}
      </p>
    </div>
  );
}
