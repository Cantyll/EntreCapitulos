'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import styles from './comments.module.css';

/*
 * Aviso "Comentário excluído." Depois de excluir, a página é atualizada pelo servidor e o comentário sai da
 * lista, então o aviso não pode morar dentro dele: fica numa região de status que persiste acima da lista
 * (visível para todo mundo e anunciada pelos leitores de tela).
 */

const NoticeContext = createContext<(message: string) => void>(() => {});

export const useRetractNotice = () => useContext(NoticeContext);

export function RetractNoticeProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 6000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <NoticeContext value={show}>
      <div role="status" aria-live="polite">
        {message && <p className={styles.notice}>{message}</p>}
      </div>
      {children}
    </NoticeContext>
  );
}
