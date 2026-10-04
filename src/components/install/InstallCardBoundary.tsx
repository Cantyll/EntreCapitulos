'use client';

import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Chamado uma vez por erro capturado; quem usa registra (só o nome do erro) e decide a frequência. */
  onError: (error: unknown) => void;
};

type State = { failed: boolean };

/**
 * Isola o cartão de instalação do resto da página. O código do cartão é baixado sob demanda (`next/dynamic`): se o
 * download falhar (rede instável no iPhone, aba aberta antes de um deploy, bloqueador de conteúdo), o erro seria
 * lançado na renderização do layout e derrubaria o site inteiro. Aqui o cartão simplesmente deixa de existir.
 * O estado de falha dura a página inteira (o `import()` rejeitado fica guardado), então não há "tentar de novo".
 */
export class InstallCardBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
