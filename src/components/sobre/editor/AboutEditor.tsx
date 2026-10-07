'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  publishAboutAction,
  restoreAboutRevisionAction,
  saveAboutDraftAction,
} from '@/app/painel/sobre/actions';
import { ProvisionalNotice } from '@/components/sobre/ProvisionalNotice';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/ui/Icon';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import {
  ABOUT_LIMITS,
  ABOUT_ISSUE_MESSAGES,
  normalizeAbout,
  normalizeLinkUrl,
  parseAbout,
  type AboutContent,
  type AboutFact,
  type AboutPhoto,
} from '@/lib/about';
import {
  canAddLink,
  canAddSection,
  canAddStep,
  canRemoveStep,
  contentSignature,
  fieldErrorMap,
  isDirty,
  moveAnnouncement,
  moveItem,
  removeAt,
  toContent,
  toForm,
  type FormContent,
} from '@/lib/about/editor-model';
import type { HistoryItem, ServerDraft } from '@/lib/about/outcomes';
import { formatDateTime } from '@/lib/site';

import styles from './aboutEditor.module.css';
import { AboutPreview } from './AboutPreview';
import { ItemActions, SwitchField, TextAreaField, TextField } from './fields';
import { HistoryPanel } from './HistoryPanel';
import { PhotoField } from './PhotoField';
import { RichTextField } from './RichTextField';

type Message = { kind: 'ok' | 'error' | 'info'; text: string; link?: boolean } | null;
type Conflict = {
  server: ServerDraft | null;
  retry: 'save' | 'publish' | { restore: HistoryItem };
};

export type AboutEditorInitial = {
  content: AboutContent;
  draftUpdatedAt: string | null;
  /** O horário do último salvamento do rascunho, já formatado (o token em si nunca vira Date). */
  draftSavedLabel: string | null;
  publishedAt: string | null;
  publishedSignature: string | null;
  contentUnreadable: boolean;
};

const EMPTY_PARAGRAPH = { type: 'doc' as const, content: [] };

/*
 * O editor da página Sobre. Formulário ESTRUTURADO (não uma página livre): cada campo tem o limite do banco e um
 * contador; o layout da página é fixo e o visual segue o tema da capa do livro atual. Nada é gravado sozinho: o
 * rascunho só é gravado no botão "Salvar rascunho" (sem autosave nesta etapa: a página é editada raramente, por uma
 * ou duas pessoas, e gravar sozinho um rascunho compartilhado tornaria silencioso o "último a gravar vence" entre
 * administradores). Por isso a tela mostra sempre se há alterações não salvas e o horário do último salvamento, e
 * avisa ao sair. O token de concorrência (`updated_at` do rascunho) é texto opaco, ecoado como veio.
 */
export function AboutEditor({
  initial,
  facts,
  history,
}: {
  initial: AboutEditorInitial;
  /** Os números reais da página (só os que não são zero), para a pré-visualização. */
  facts: readonly AboutFact[];
  /** As últimas 20 versões publicadas (a página refaz a lista depois de publicar ou restaurar). */
  history: readonly HistoryItem[];
}) {
  const baseId = useId();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);
  const focusAfterMove = useRef<{ key: string; dir: 'up' | 'down' } | null>(null);
  const focusAfterRemove = useRef<'section' | 'link' | 'step' | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);

  const [form, setForm] = useState<FormContent>(() => toForm(initial.content));
  const [generation, setGeneration] = useState(0);
  const [baseline, setBaseline] = useState(() => contentSignature(initial.content));
  const [token, setToken] = useState<string | null>(initial.draftUpdatedAt);
  const [savedLabel, setSavedLabel] = useState<string | null>(initial.draftSavedLabel);
  const [publishedSignature, setPublishedSignature] = useState<string | null>(
    initial.publishedSignature,
  );
  const [everPublished, setEverPublished] = useState(initial.publishedAt !== null);
  const [message, setMessage] = useState<Message>(
    initial.contentUnreadable
      ? {
          kind: 'error',
          text: 'O texto salvo não pôde ser lido e foi trocado pelo texto padrão. Confira antes de salvar.',
        }
      : null,
  );
  // Depois de uma tentativa de salvar ou publicar, os avisos de cada campo acompanham o que a pessoa digita.
  const [showErrors, setShowErrors] = useState<false | 'save' | 'publish'>(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [restoreTarget, setRestoreTarget] = useState<HistoryItem | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [statusFocus, setStatusFocus] = useState(0);

  const dirty = useMemo(() => isDirty(form, baseline), [form, baseline]);
  // O que a pré-visualização mostra: o formulário agora (salvo ou não), com os textos simples normalizados.
  const previewContent = useMemo(() => normalizeAbout(toContent(form)) as AboutContent, [form]);
  const guard = useUnsavedGuard(dirty);
  // Só se publica o que é novo: com alterações, ou um rascunho salvo diferente do que está no ar (ou nada no ar).
  const hasUnpublished = dirty || baseline !== publishedSignature;
  const locked = busy !== null || uploading;

  // Devolve o foco ao botão que se acabou de usar para mover um item (o item trocou de lugar na lista).
  useEffect(() => {
    const target = focusAfterMove.current;
    if (!target) return;
    focusAfterMove.current = null;
    const root = rootRef.current;
    if (!root) return;
    const same = root.querySelector<HTMLButtonElement>(`[data-move="${target.key}:${target.dir}"]`);
    const other = root.querySelector<HTMLButtonElement>(
      `[data-move="${target.key}:${target.dir === 'up' ? 'down' : 'up'}"]`,
    );
    (same && !same.disabled ? same : other)?.focus();
  }, [form.sections, form.links]);

  // Depois de remover um item o botão dele sai da tela: o foco vai para o "Adicionar" da mesma lista.
  useEffect(() => {
    const kind = focusAfterRemove.current;
    if (!kind) return;
    focusAfterRemove.current = null;
    rootRef.current?.querySelector<HTMLButtonElement>(`[data-add="${kind}"]`)?.focus();
  }, [form.sections, form.links, form.howItWorks.steps]);

  // Os avisos ficam no topo da página e os botões, na barra de baixo: erro, conflito e publicação levam o foco (e a
  // tela) até o aviso, para a pessoa não tocar de novo sem ver o que aconteceu. "Rascunho salvo" não rola a tela: o
  // estado já aparece na barra.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const target = conflict
      ? conflictRef.current
      : message && (message.kind !== 'ok' || message.link)
        ? noticeRef.current
        : null;
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [message, conflict]);

  // Salvar desliga o botão "Salvar rascunho" (e publicar, o "Publicar"): se o foco estava nele, vai para o estado na
  // barra, que fica no mesmo lugar, em vez de cair no início da página.
  useEffect(() => {
    if (statusFocus === 0) return;
    const active = document.activeElement;
    const lost =
      !active ||
      active === document.body ||
      (active instanceof HTMLButtonElement && active.disabled);
    if (lost) statusRef.current?.focus({ preventScroll: true });
  }, [statusFocus]);

  const errors = useMemo(() => {
    if (!showErrors) return {};
    const parsed = parseAbout(toContent(form), { forPublish: showErrors === 'publish' });
    return parsed.ok ? {} : fieldErrorMap(parsed.fields);
  }, [form, showErrors]);

  const update = (patch: Partial<FormContent>) => {
    setForm((current) => ({ ...current, ...patch }));
    // "Rascunho salvo" ou "Página publicada" deixa de valer assim que a pessoa mexe de novo.
    setMessage((current) => (current && current.kind !== 'error' ? null : current));
  };
  const newKey = (kind: string) => `novo-${kind}-${++counter.current}`;
  const err = (path: string): string | undefined => errors[path];

  /** Confere no navegador, com as mesmas regras do servidor, antes de gastar uma ida e volta. */
  function validateLocally(forPublish: boolean): AboutContent | null {
    const parsed = parseAbout(toContent(form), { forPublish });
    if (parsed.ok) return parsed.content;
    setShowErrors(forPublish ? 'publish' : 'save');
    setMessage({ kind: 'error', text: ABOUT_ISSUE_MESSAGES[parsed.issue] });
    return null;
  }

  function adopt(content: AboutContent, nextToken: string) {
    setToken(nextToken);
    setBaseline(contentSignature(content));
    setSavedLabel(formatDateTime(new Date()));
    setShowErrors(false);
    setConflict(null);
    setStatusFocus((n) => n + 1);
  }

  async function save(expected: string | null = token) {
    const content = validateLocally(false);
    if (!content) return;
    setBusy('save');
    setMessage(null);
    try {
      const outcome = await saveAboutDraftAction({ content, expectedUpdatedAt: expected });
      if (outcome.kind === 'saved') {
        adopt(outcome.content, outcome.updatedAt);
        setMessage({ kind: 'ok', text: 'Rascunho salvo. O site ainda mostra a versão publicada.' });
      } else if (outcome.kind === 'conflict') {
        setConflict({ server: outcome.server, retry: 'save' });
        setMessage(null);
      } else if (outcome.kind === 'invalid') {
        setShowErrors('save');
        setMessage({ kind: 'error', text: outcome.message });
      } else {
        setMessage({ kind: 'error', text: outcome.message });
      }
    } catch {
      setMessage({ kind: 'error', text: 'Sem conexão: o rascunho não foi salvo. Tente de novo.' });
    } finally {
      setBusy(null);
    }
  }

  function askPublish() {
    if (!validateLocally(true)) return;
    setPublishError(null);
    setPublishOpen(true);
  }

  async function publish(expected: string | null = token, viaDialog = true) {
    const content = validateLocally(true);
    if (!content) return setPublishOpen(false);
    setBusy('publish');
    setPublishError(null);
    try {
      const outcome = await publishAboutAction({ content, expectedUpdatedAt: expected });
      if (outcome.kind === 'published') {
        adopt(outcome.content, outcome.updatedAt);
        setPublishedSignature(contentSignature(outcome.content));
        setEverPublished(true);
        setPublishOpen(false);
        setMessage({
          kind: 'ok',
          text: 'Página publicada. O texto novo já está no ar.',
          link: true,
        });
      } else if (outcome.kind === 'conflict') {
        setPublishOpen(false);
        setConflict({ server: outcome.server, retry: 'publish' });
        setMessage(null);
      } else if (outcome.kind === 'invalid') {
        setPublishOpen(false);
        setShowErrors('publish');
        setMessage({ kind: 'error', text: outcome.message });
      } else {
        // O rascunho pode ter sido salvo mesmo sem publicar: acompanha o token novo.
        if (outcome.savedUpdatedAt) adopt(content, outcome.savedUpdatedAt);
        if (viaDialog) setPublishError(outcome.message);
        else setMessage({ kind: 'error', text: outcome.message });
      }
    } catch {
      const text = 'Sem conexão: a página não foi publicada. Tente de novo.';
      if (viaDialog) setPublishError(text);
      else setMessage({ kind: 'error', text });
    } finally {
      setBusy(null);
    }
  }

  function loadServerVersion(server: ServerDraft) {
    setForm(toForm(server.content, `srv${generation + 1}`));
    setGeneration((g) => g + 1);
    adopt(server.content, server.updatedAt);
    setMessage({
      kind: 'info',
      text: 'Carreguei a versão do servidor. Suas alterações não salvas foram descartadas.',
    });
  }

  async function restore(item: HistoryItem, expected: string | null = token, viaDialog = true) {
    setBusy('publish');
    setRestoreError(null);
    try {
      const outcome = await restoreAboutRevisionAction({
        revisionId: item.id,
        expectedUpdatedAt: expected,
      });
      if (outcome.kind === 'restored') {
        setForm(toForm(outcome.content, `rst${generation + 1}`));
        setGeneration((g) => g + 1);
        adopt(outcome.content, outcome.updatedAt);
        setPublishedSignature(contentSignature(outcome.content));
        setEverPublished(true);
        setRestoreTarget(null);
        setMessage({
          kind: 'ok',
          text: `Versão de ${formatDateTime(item.publishedAt)} restaurada e publicada.`,
          link: true,
        });
        router.refresh();
      } else if (outcome.kind === 'conflict') {
        setRestoreTarget(null);
        setConflict({ server: outcome.server, retry: { restore: item } });
        setMessage(null);
      } else if (viaDialog) {
        setRestoreError(outcome.message);
      } else {
        setMessage({ kind: 'error', text: outcome.message });
      }
    } catch {
      const text = 'Sem conexão: a versão não foi restaurada. Tente de novo.';
      if (viaDialog) setRestoreError(text);
      else setMessage({ kind: 'error', text });
    } finally {
      setBusy(null);
    }
  }

  function moveSection(index: number, delta: -1 | 1) {
    const item = form.sections[index];
    if (!item) return;
    focusAfterMove.current = { key: item.key, dir: delta === -1 ? 'up' : 'down' };
    update({ sections: moveItem(form.sections, index, delta) });
    setAnnounce(moveAnnouncement('Seção', true, index, index + delta, form.sections.length));
  }

  function moveLink(index: number, delta: -1 | 1) {
    const item = form.links[index];
    if (!item) return;
    focusAfterMove.current = { key: item.key, dir: delta === -1 ? 'up' : 'down' };
    update({ links: moveItem(form.links, index, delta) });
    setAnnounce(moveAnnouncement('Link', false, index, index + delta, form.links.length));
  }

  function removeItem(kind: 'section' | 'link' | 'step', index: number) {
    focusAfterRemove.current = kind;
    if (kind === 'section') {
      update({ sections: removeAt(form.sections, index) });
      setAnnounce(`Seção ${index + 1} removida.`);
    } else if (kind === 'link') {
      update({ links: removeAt(form.links, index) });
      setAnnounce(`Link ${index + 1} removido.`);
    } else {
      update({
        howItWorks: { ...form.howItWorks, steps: removeAt(form.howItWorks.steps, index) },
      });
      setAnnounce(`Passo ${index + 1} removido.`);
    }
  }

  const patchSection = (index: number, patch: Partial<FormContent['sections'][number]>) =>
    update({ sections: form.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const patchLink = (index: number, patch: Partial<FormContent['links'][number]>) =>
    update({ links: form.links.map((l, i) => (i === index ? { ...l, ...patch } : l)) });
  const patchStep = (index: number, patch: Partial<FormContent['howItWorks']['steps'][number]>) =>
    update({
      howItWorks: {
        ...form.howItWorks,
        steps: form.howItWorks.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      },
    });

  const statusText = dirty
    ? 'Alterações não salvas'
    : savedLabel
      ? `Rascunho salvo em ${savedLabel}`
      : 'Nada salvo ainda';

  return (
    <div
      className={styles.root}
      ref={rootRef}
      data-editor-root
      data-tour="about-editor"
      data-unsaved={dirty ? 'true' : undefined}
    >
      {!everPublished && <ProvisionalNotice />}

      {message && (
        <div
          ref={noticeRef}
          tabIndex={-1}
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`${styles.notice} ${message.kind === 'error' ? styles.noticeError : message.kind === 'ok' ? styles.noticeOk : styles.noticeWarn}`}
        >
          <span>{message.text}</span>
          {message.link && (
            <Link href="/sobre" className={styles.iconBtn}>
              Ver a página
            </Link>
          )}
        </div>
      )}

      {conflict && (
        <div
          ref={conflictRef}
          tabIndex={-1}
          role="alert"
          className={`${styles.notice} ${styles.noticeWarn}`}
          data-about-conflict=""
        >
          <span>
            Outra pessoa da administração mudou esta página enquanto você editava.
            {conflict.server
              ? ' Escolha qual versão manter.'
              : ' Recarregue a página para ver a versão atual.'}
          </span>
          <div className={styles.noticeActions}>
            {conflict.server ? (
              <>
                <Button
                  size="sm"
                  variant="soft"
                  disabled={locked}
                  onClick={() => conflict.server && loadServerVersion(conflict.server)}
                >
                  Carregar a versão do servidor
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={locked}
                  onClick={() => {
                    const server = conflict.server;
                    if (!server) return;
                    // Com o token do servidor, a gravação sobrescreve a versão dele.
                    setToken(server.updatedAt);
                    setConflict(null);
                    if (conflict.retry === 'publish') void publish(server.updatedAt, false);
                    else if (conflict.retry === 'save') void save(server.updatedAt);
                    else void restore(conflict.retry.restore, server.updatedAt, false);
                  }}
                >
                  {typeof conflict.retry === 'object'
                    ? 'Restaurar mesmo assim'
                    : 'Sobrescrever com a minha'}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="soft" onClick={() => window.location.reload()}>
                Recarregar a página
              </Button>
            )}
          </div>
        </div>
      )}

      <p className={styles.live} role="status" aria-live="polite">
        {announce}
      </p>

      <div className={styles.tabs} data-tour="about-preview">
        <div className={styles.seg} role="tablist" aria-label="Editar ou pré-visualizar">
          <button
            type="button"
            role="tab"
            id={`${baseId}-aba-editar`}
            aria-selected={tab === 'edit'}
            aria-controls={`${baseId}-painel-editar`}
            onClick={() => setTab('edit')}
          >
            Editar
          </button>
          <button
            type="button"
            role="tab"
            id={`${baseId}-aba-previa`}
            aria-selected={tab === 'preview'}
            aria-controls={`${baseId}-painel-previa`}
            onClick={() => setTab('preview')}
          >
            Pré-visualizar
          </button>
        </div>
      </div>

      <div
        id={`${baseId}-painel-previa`}
        role="tabpanel"
        aria-labelledby={`${baseId}-aba-previa`}
        hidden={tab !== 'preview'}
      >
        {tab === 'preview' && <AboutPreview content={previewContent} facts={facts} />}
      </div>

      <div
        id={`${baseId}-painel-editar`}
        role="tabpanel"
        aria-labelledby={`${baseId}-aba-editar`}
        hidden={tab !== 'edit'}
        className={styles.root}
      >
        <form onSubmit={(event) => event.preventDefault()} noValidate className={styles.root}>
          <section className={styles.card} aria-labelledby={`${baseId}-apresentacao`}>
            <h2 id={`${baseId}-apresentacao`}>Apresentação</h2>
            <TextField
              id={`${baseId}-titulo`}
              label="Título da página"
              value={form.title}
              max={ABOUT_LIMITS.title}
              onChange={(title) => update({ title })}
              error={err('title')}
              disabled={locked}
              dataTour="about-title"
            />
            <PhotoField
              photo={form.photo}
              onChange={(photo: AboutPhoto | null) => update({ photo })}
              onBusyChange={setUploading}
              altError={err('photo.alt')}
              disabled={busy !== null}
            />
            <TextAreaField
              id={`${baseId}-bio`}
              label="Bio curta da autora"
              hint="O nome da autora não se edita aqui."
              value={form.bio}
              max={ABOUT_LIMITS.bio}
              rows={3}
              onChange={(bio) => update({ bio })}
              error={err('bio')}
              disabled={locked}
            />
          </section>

          <section className={styles.card} aria-labelledby={`${baseId}-abertura`}>
            <h2 id={`${baseId}-abertura`}>Texto de abertura</h2>
            <RichTextField
              key={`intro-${generation}`}
              id={`${baseId}-intro`}
              label="Texto de abertura"
              placeholder="Escreva a abertura da página…"
              initial={form.intro}
              onChange={(intro) => update({ intro })}
              error={err('intro')}
              disabled={locked}
              dataTour="about-intro"
            />
          </section>

          <section
            className={styles.card}
            aria-labelledby={`${baseId}-secoes`}
            data-tour="about-sections"
          >
            <div className={styles.cardHead}>
              <h2 id={`${baseId}-secoes`}>Seções extras</h2>
              <Button
                size="sm"
                variant="soft"
                data-add="section"
                disabled={locked || !canAddSection(form.sections.length)}
                onClick={() =>
                  update({
                    sections: [
                      ...form.sections,
                      { key: newKey('secao'), title: '', body: EMPTY_PARAGRAPH },
                    ],
                  })
                }
              >
                <Icon name="plus" size="sm" />
                Adicionar seção
              </Button>
            </div>
            <p className={styles.hint}>
              Até {ABOUT_LIMITS.sectionsMax} seções, mostradas depois do texto de abertura, na ordem
              abaixo.
            </p>
            {form.sections.length === 0 ? (
              <p className={styles.hint}>Nenhuma seção extra.</p>
            ) : (
              <ol className={styles.items}>
                {form.sections.map((section, index) => (
                  <li key={section.key} className={styles.item}>
                    <div className={styles.itemHead}>
                      <h3>Seção {index + 1}</h3>
                      <ItemActions
                        noun="seção"
                        index={index}
                        count={form.sections.length}
                        itemKey={section.key}
                        onMove={(delta) => moveSection(index, delta)}
                        onRemove={() => removeItem('section', index)}
                        disabled={locked}
                      />
                    </div>
                    <TextField
                      id={`${baseId}-secao-${section.key}-titulo`}
                      label={`Título da seção ${index + 1}`}
                      value={section.title}
                      max={ABOUT_LIMITS.sectionTitle}
                      onChange={(title) => patchSection(index, { title })}
                      error={err(`sections.${index}.title`)}
                      disabled={locked}
                    />
                    <RichTextField
                      key={`secao-${section.key}-${generation}`}
                      id={`${baseId}-secao-${section.key}`}
                      label={`Texto da seção ${index + 1}`}
                      placeholder="Escreva o texto da seção…"
                      initial={section.body}
                      onChange={(body) => patchSection(index, { body })}
                      error={err(`sections.${index}.body`)}
                      disabled={locked}
                    />
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section
            className={styles.card}
            aria-labelledby={`${baseId}-links`}
            data-tour="about-links"
          >
            <div className={styles.cardHead}>
              <h2 id={`${baseId}-links`}>Links</h2>
              <Button
                size="sm"
                variant="soft"
                data-add="link"
                disabled={locked || !canAddLink(form.links.length)}
                onClick={() =>
                  update({ links: [...form.links, { key: newKey('link'), label: '', url: '' }] })
                }
              >
                <Icon name="plus" size="sm" />
                Adicionar link
              </Button>
            </div>
            <p className={styles.hint}>
              Até {ABOUT_LIMITS.linksMax} links, no cartão da autora. Só endereços https.
            </p>
            {form.links.length === 0 ? (
              <p className={styles.hint}>Nenhum link.</p>
            ) : (
              <ol className={styles.items}>
                {form.links.map((link, index) => (
                  <li key={link.key} className={styles.item}>
                    <div className={styles.itemHead}>
                      <h3>Link {index + 1}</h3>
                      <ItemActions
                        noun="link"
                        index={index}
                        count={form.links.length}
                        itemKey={link.key}
                        onMove={(delta) => moveLink(index, delta)}
                        onRemove={() => removeItem('link', index)}
                        disabled={locked}
                      />
                    </div>
                    <div className={styles.linkFields}>
                      <TextField
                        id={`${baseId}-link-${link.key}-rotulo`}
                        label={`Texto do link ${index + 1}`}
                        value={link.label}
                        max={ABOUT_LIMITS.linkLabel}
                        onChange={(label) => patchLink(index, { label })}
                        error={err(`links.${index}.label`)}
                        disabled={locked}
                      />
                      <TextField
                        id={`${baseId}-link-${link.key}-url`}
                        label={`Endereço do link ${index + 1}`}
                        value={link.url}
                        max={ABOUT_LIMITS.linkUrl}
                        inputMode="url"
                        onChange={(url) => patchLink(index, { url })}
                        onBlur={(url) => patchLink(index, { url: normalizeLinkUrl(url) })}
                        error={err(`links.${index}.url`)}
                        disabled={locked}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section
            className={styles.card}
            aria-labelledby={`${baseId}-como`}
            data-tour="about-toggles"
          >
            <h2 id={`${baseId}-como`}>Blocos que se mostram ou se ocultam</h2>
            <SwitchField
              id={`${baseId}-stats`}
              label="Estatísticas"
              description="Quantos livros foram terminados e quantas sessões foram publicadas. Só aparece quando há números."
              checked={form.stats.visible}
              onChange={(visible) => update({ stats: { visible } })}
              disabled={locked}
            />
            <SwitchField
              id={`${baseId}-como-switch`}
              label="Como funciona"
              description="Os passos que explicam o clube."
              checked={form.howItWorks.visible}
              onChange={(visible) => update({ howItWorks: { ...form.howItWorks, visible } })}
              disabled={locked}
            />
            <div className={styles.group}>
              {!form.howItWorks.visible && (
                <p className={styles.hint}>
                  Este bloco está oculto na página. Os passos continuam salvos aqui.
                </p>
              )}
              <ol className={styles.items}>
                {form.howItWorks.steps.map((step, index) => (
                  <li key={step.key} className={styles.item}>
                    <div className={styles.itemHead}>
                      <h3>Passo {index + 1}</h3>
                      <div className={styles.itemActions}>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          data-danger=""
                          aria-label={`Remover passo ${index + 1}`}
                          disabled={locked || !canRemoveStep(form.howItWorks.steps.length)}
                          onClick={() => removeItem('step', index)}
                        >
                          <Icon name="trash" size="sm" />
                        </button>
                      </div>
                    </div>
                    <TextField
                      id={`${baseId}-passo-${step.key}-titulo`}
                      label={`Título do passo ${index + 1}`}
                      value={step.title}
                      max={ABOUT_LIMITS.stepTitle}
                      onChange={(title) => patchStep(index, { title })}
                      error={err(`howItWorks.steps.${index}.title`)}
                      disabled={locked}
                    />
                    <TextAreaField
                      id={`${baseId}-passo-${step.key}-texto`}
                      label={`Texto do passo ${index + 1}`}
                      value={step.text}
                      max={ABOUT_LIMITS.stepText}
                      rows={3}
                      onChange={(text) => patchStep(index, { text })}
                      error={err(`howItWorks.steps.${index}.text`)}
                      disabled={locked}
                    />
                  </li>
                ))}
              </ol>
              <Button
                size="sm"
                variant="soft"
                data-add="step"
                disabled={locked || !canAddStep(form.howItWorks.steps.length)}
                onClick={() =>
                  update({
                    howItWorks: {
                      ...form.howItWorks,
                      steps: [
                        ...form.howItWorks.steps,
                        { key: newKey('passo'), title: '', text: '' },
                      ],
                    },
                  })
                }
              >
                <Icon name="plus" size="sm" />
                Adicionar passo
              </Button>
              {err('howItWorks.steps') && (
                <p className={styles.fieldError}>{err('howItWorks.steps')}</p>
              )}
            </div>
            <SwitchField
              id={`${baseId}-cta-switch`}
              label="Chamada final"
              description="O convite para entrar no clube, no fim da página (só para quem não está logado)."
              checked={form.cta.visible}
              onChange={(visible) => update({ cta: { ...form.cta, visible } })}
              disabled={locked}
            />
            <TextAreaField
              id={`${baseId}-cta`}
              label="Texto da chamada final"
              hint="O título e o botão desta chamada são fixos."
              value={form.cta.text}
              max={ABOUT_LIMITS.ctaText}
              rows={2}
              onChange={(text) => update({ cta: { ...form.cta, text } })}
              error={err('cta.text')}
              disabled={locked}
            />
          </section>

          <section
            className={`${styles.card} ${styles.fixedBlocks}`}
            aria-labelledby={`${baseId}-fixos`}
          >
            <h2 id={`${baseId}-fixos`}>Não editáveis aqui</h2>
            <p>
              Os <b>Combinados da comunidade</b> fazem parte dos Termos de Uso e a seção{' '}
              <b>Leia como aplicativo</b> faz parte do site: os dois aparecem sempre e não se editam
              nem se ocultam aqui. O visual da página segue o tema da capa do livro atual.
            </p>
          </section>
        </form>

        <HistoryPanel
          items={history}
          disabled={locked}
          onRestore={(item) => {
            setRestoreError(null);
            setRestoreTarget(item);
          }}
        />
      </div>

      <div className={styles.bar} data-about-bar="">
        <div
          className={styles.status}
          role="status"
          aria-live="polite"
          ref={statusRef}
          tabIndex={-1}
        >
          <span
            className={`${styles.dot} ${dirty ? styles.dotDirty : savedLabel ? styles.dotSaved : ''}`}
            aria-hidden="true"
          />
          <span data-about-status={dirty ? 'dirty' : savedLabel ? 'saved' : 'none'}>
            {statusText}
          </span>
        </div>
        <div className={styles.actions}>
          <Button
            variant="soft"
            disabled={locked || !dirty}
            onClick={() => void save()}
            data-tour="about-save"
          >
            {busy === 'save' ? 'Salvando…' : 'Salvar rascunho'}
          </Button>
          <Button
            disabled={locked || !hasUnpublished}
            onClick={askPublish}
            data-tour="about-publish"
          >
            Publicar
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={publishOpen}
        title="Publicar a página Sobre?"
        confirmLabel="Publicar"
        busyLabel="Publicando…"
        busy={busy === 'publish'}
        error={publishError}
        onConfirm={() => void publish()}
        onClose={() => {
          if (busy !== 'publish') setPublishOpen(false);
        }}
      >
        <p>
          O texto atual vai ao ar agora, para qualquer visitante. Se algo ficar errado, dá para
          voltar para uma versão anterior no histórico.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={restoreTarget !== null}
        title="Restaurar esta versão?"
        confirmLabel="Restaurar e publicar"
        busyLabel="Restaurando…"
        busy={busy === 'publish' && restoreTarget !== null}
        error={restoreError}
        onConfirm={() => restoreTarget && void restore(restoreTarget)}
        onClose={() => {
          if (busy === null) setRestoreTarget(null);
        }}
      >
        <p>
          A versão de {restoreTarget ? formatDateTime(restoreTarget.publishedAt) : ''} vai ao ar
          agora e substitui o seu rascunho atual
          {dirty ? ' (as alterações que você ainda não salvou se perdem)' : ''}. Dá para voltar para
          outra versão no histórico.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={guard.pendingHref !== null}
        title="Sair sem salvar?"
        confirmLabel="Sair sem salvar"
        busyLabel="Saindo…"
        busy={false}
        danger
        initialFocus="cancel"
        onConfirm={guard.leave}
        onClose={guard.stay}
      >
        <p>
          Você tem alterações que ainda não foram salvas no rascunho. Se sair agora, elas se perdem.
        </p>
      </ConfirmDialog>
    </div>
  );
}
