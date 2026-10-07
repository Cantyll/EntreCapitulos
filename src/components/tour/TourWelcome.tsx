'use client';

import { useId } from 'react';

import { Button } from '@/components/ui/Button';
import { INSTALL_RULES } from '@/content/install';

import { useTour } from './TourProvider';
import styles from './tour.module.css';

/*
 * "Quer um tour rápido?" (etapa 8k): um CARTÃO no fluxo da página, no topo do conteúdo do painel (não é modal, não
 * cobre nada e não rouba o foco). Aparece para quem é da equipe e nunca viu o tutorial (a versão vista é 0); se a
 * leitura dessa versão falhar, ou antes do Database deploy, não aparece.
 *
 * Nunca três avisos de uma vez. A ordem é Termos, tour, instalação, e só o primeiro fica visível até a pessoa
 * dispensá-lo: com o aviso dos Termos na tela, este cartão espera; enquanto este cartão estiver pendente, o cartão
 * de instalação também espera (pelo marcador `data-no-install-card`, que o `InstallGate` observa).
 */
export function TourWelcome() {
  const tour = useTour();
  const titleId = useId();
  if (!tour || !tour.welcomePending) return null;

  const marker = { [INSTALL_RULES.suppressAttribute]: '' };
  return (
    <>
      <span hidden {...marker} />
      {!tour.termsNoticeShown && (
        <section className={styles.welcome} aria-labelledby={titleId} data-tour-welcome="">
          <div>
            <h2 id={titleId}>Quer um tour rápido?</h2>
            <p>
              Em poucos passos, mostramos o que dá para fazer no painel. O tour só mostra e explica:
              nada é criado, publicado nem apagado.
            </p>
          </div>
          <div className={styles.welcomeActions}>
            <Button variant="ghost" onClick={() => tour.answerWelcome(false)}>
              Agora não
            </Button>
            <Button onClick={() => tour.answerWelcome(true)}>Começar</Button>
          </div>
        </section>
      )}
    </>
  );
}
