import {
  decide,
  isPreviewRequest,
  loadInstallState,
  type InstallDecision,
  type InstallSurface,
  type StorageLike,
} from './install-state';
import { installEligibility, readPlatform, type PlatformWindow } from './platform';

/*
 * A decisão do cartão de instalação a partir do navegador (etapa 8e): junta o aparelho (`platform.ts`), o estado
 * guardado e as regras (`install-state.ts`). Só LÊ (aparelho, localStorage, endereço): quem grava a visita contada
 * é o `InstallGate`, num efeito. Recebe o `window` por parâmetro para os testes usarem um objeto de mentira.
 */

export type InstallWindow = PlatformWindow & {
  /** Acessar a propriedade já pode lançar (cookies bloqueados): `loadInstallState` captura. */
  readonly localStorage: StorageLike;
  location: { search: string };
};

export type InstallEvaluation = {
  decision: InstallDecision;
  /** `?instalacao=ver`: nada é gravado. */
  preview: boolean;
  /** O armazenamento recusou a leitura (ou o texto guardado estava quebrado). Registrar UMA vez, só o nome do erro. */
  loadFailed: boolean;
  loadError: unknown;
  /**
   * Dá para gravar a visita e a dispensa? Falso só quando o navegador recusou o armazenamento. Texto guardado
   * quebrado não impede: o estado volta ao zero e a gravação o conserta.
   */
  canSave: boolean;
};

/**
 * `search` é a busca (`?instalacao=ver`) da página que está sendo decidida. O `InstallGate` a passa do roteador, que
 * muda junto com o `pathname`; sem ela vale `window.location.search` (correto só numa carga completa, porque numa
 * navegação no cliente o endereço do navegador muda depois da renderização).
 */
export function evaluateInstall(
  win: InstallWindow,
  surface: InstallSurface,
  pathname: string,
  now: Date,
  search: string = win.location.search,
): InstallEvaluation {
  const eligibility = installEligibility(readPlatform(win));
  // A pré-visualização só vale para o cartão do Safari (ver `decide`).
  const preview = eligibility === 'card' && isPreviewRequest(search);
  // Aparelho que não é elegível: nada é lido nem contado.
  if (eligibility === 'none') {
    return {
      decision: {
        view: null,
        state: { visits: 0, lastDay: null, dismissedAt: null, never: false },
        persist: false,
      },
      preview,
      loadFailed: false,
      loadError: undefined,
      canSave: false,
    };
  }
  const loaded = loadInstallState(() => win.localStorage);
  return {
    decision: decide({ eligibility, surface, pathname, preview, now, state: loaded.state }),
    preview,
    loadFailed: loaded.failed,
    loadError: loaded.error,
    canSave: loaded.writable,
  };
}
