'use client';

import type { Editor } from '@tiptap/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  deleteDraftAction,
  publishSessionAction,
  unpublishSessionAction,
} from '@/app/painel/sessoes/actions';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/ui/Icon';
import {
  autoExcerpt,
  checkDividers,
  countWords,
  dividersOf,
  nextDividerChapter,
  readMinutes,
  SessionBody,
  suggestTitle,
  type BodyDoc,
} from '@/lib/session-body';
import { afterFlush, statusLabel } from '@/lib/session-editor/autosave';
import type { EditorBook } from '@/lib/sessions/queries';
import type { NoteItem, QuestionItem } from '@/lib/sessions/items';
import { adminBookHref, adminSessionsNoticeHref, sessionHref } from '@/lib/routes';
import type { SessionSnapshot } from '@/lib/session-editor/snapshot';

import { ChaptersPanel } from './ChaptersPanel';
import { RichTextEditor } from './editor/RichTextEditor';
import { NotesPanel } from './NotesPanel';
import { QuestionsPanel } from './QuestionsPanel';
import styles from './sessoes.module.css';
import { StarPicker } from './StarPicker';
import { useSessionAutosave } from './useSessionAutosave';

export type EditorSession = {
  id: string | null;
  number: number;
  status: 'draft' | 'published';
  /** `updated_at` como texto opaco; `null` enquanto a sessão não existe no banco. */
  updatedAt: string | null;
  commentCount: number;
};

type Dialog = null | 'publish' | 'unpublish' | 'delete';

const VISIBILITY_LABEL = { public: 'Pública', members: 'Só para membros' } as const;

function ChapterField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onCommit: (value: number) => string | null;
}) {
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  const [error, setError] = useState<string | null>(null);

  // Quando o valor muda por fora (a faixa recusada volta ao que era), o campo acompanha.
  if (value !== shown) {
    setShown(value);
    setText(String(value));
  }

  const commit = () => {
    const parsed = Number(text);
    if (text.trim() === '' || !Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
      setError('Use um número de 1 a 1000.');
      setText(String(value));
      return;
    }
    if (parsed === value) {
      setError(null);
      return;
    }
    const problem = onCommit(parsed);
    setError(problem);
    if (problem) setText(String(value));
  };

  return (
    <>
      <input
        className={styles.chapterInput}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
      />
      {error && (
        <span role="alert" className={styles.muted} style={{ color: 'var(--danger)' }}>
          {error}
        </span>
      )}
    </>
  );
}

export function SessionEditor({
  book,
  session,
  snapshot,
  notes,
  questions,
}: {
  book: EditorBook;
  session: EditorSession;
  snapshot: SessionSnapshot;
  notes: NoteItem[];
  questions: QuestionItem[];
}) {
  const router = useRouter();
  const published = session.status === 'published';
  const [sessionId, setSessionId] = useState(session.id);
  const [number, setNumber] = useState(session.number);
  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [fixTotal, setFixTotal] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const { controller, store, state, ready, prompt, acceptRestore, declineRestore } =
    useSessionAutosave({
      bookId: book.id,
      sessionId: session.id,
      token: session.updatedAt,
      snapshot,
      mode: published ? 'published' : 'draft',
      onCreated: (id, createdNumber) => {
        setSessionId(id);
        setNumber(createdNumber);
      },
    });

  const current = state.current;
  const locked = !ready || prompt !== null || publishing;

  const update = useCallback(
    (patch: Partial<SessionSnapshot>) => {
      controller.edit({ ...controller.getState().current, ...patch });
    },
    [controller],
  );

  /** Campos de escolha (visibilidade, nota, comentários abertos): mudam e já mandam, junto com o texto pendente. */
  const updateAndSend = useCallback(
    (patch: Partial<SessionSnapshot>) => {
      update(patch);
      void controller.flush();
    },
    [controller, update],
  );

  /** Antes de trecho ou pergunta (adicionar, editar, remover, reordenar): manda o texto pendente. */
  const beforeServerAction = useCallback(
    () => afterFlush(controller, async () => undefined),
    [controller],
  );

  const handleEditor = useCallback((next: Editor | null) => {
    editorRef.current = next;
    setEditor(next);
  }, []);

  // O controlador trocou o conteúdo por fora (restaurar, carregar do servidor, descartar): o editor
  // acompanha. `emitUpdate: false` evita que isso volte como uma "edição" nova.
  const lastRevision = useRef(state.loadRevision);
  useEffect(() => {
    if (state.loadRevision === lastRevision.current) return;
    lastRevision.current = state.loadRevision;
    editorRef.current?.commands.setContent(controller.getState().current.body, {
      emitUpdate: false,
    });
  }, [state.loadRevision, controller]);

  const suggested = suggestTitle(number, current.chapterFrom, current.chapterTo);
  const words = countWords(current.body);
  const minutes = readMinutes(current.body);
  const dividerNumbers = dividersOf(current.body).map((d) => d.attrs.chapter);
  const highest = Math.max(0, ...dividerNumbers);
  const nextDivider =
    highest >= current.chapterTo
      ? null
      : nextDividerChapter(dividerNumbers, current.chapterFrom, current.chapterTo);
  const dividerCheck = checkDividers(current.body, current.chapterFrom, current.chapterTo);
  const beyondTotal = current.chapterTo > book.totalChapters;
  const autoSummary = autoExcerpt(current.body);

  const commitRange = (key: 'chapterFrom' | 'chapterTo') => (value: number) => {
    const other = key === 'chapterFrom' ? current.chapterTo : current.chapterFrom;
    if (key === 'chapterFrom' && value > other)
      return 'O capítulo inicial não pode passar do final.';
    if (key === 'chapterTo' && value < other)
      return 'O capítulo final não pode ficar antes do inicial.';
    update({ [key]: value });
    // Mudar a faixa envia na hora, para a recusa (capítulos de outra sessão) aparecer já.
    void controller.flush();
    return null;
  };

  // --- Publicar ----------------------------------------------------------------------------------

  const openPublish = () => {
    setDialogError(null);
    setFixTotal(false);
    setDialog('publish');
  };

  const closeDialog = () => {
    if (busy) return;
    setDialog(null);
    setDialogError(null);
    setFixTotal(false);
  };

  const confirmPublish = async () => {
    setBusy(true);
    setDialogError(null);
    setFixTotal(false);
    setPublishing(true);
    // Manda o que falta (cria a sessão, se ainda não existe) e pausa o autosave durante a publicação.
    await controller.flush();
    await controller.idle();
    controller.setMode('published');
    try {
      const after = controller.getState();
      if (after.status === 'conflict') {
        setDialog(null);
        return;
      }
      if (!after.sessionId || after.token === null || after.dirty) {
        setDialogError(
          after.status === 'offline'
            ? 'Sem conexão: não dá para publicar agora. O rascunho continua salvo neste aparelho.'
            : 'Não foi possível salvar o rascunho antes de publicar. Tente de novo.',
        );
        return;
      }
      const result = await publishSessionAction({
        sessionId: after.sessionId,
        expectedUpdatedAt: after.token,
        fields: after.current,
      });
      switch (result.kind) {
        case 'published':
          await store.remove().catch(() => {});
          router.push(adminSessionsNoticeHref('publicada', result.number));
          return;
        case 'conflict':
          controller.reportConflict(result.server);
          setDialog(null);
          return;
        case 'rejected':
          // O texto foi salvo antes da função do banco falhar: guarda o token novo.
          if ('savedUpdatedAt' in result)
            controller.markSaved(result.savedUpdatedAt, after.current);
          setDialogError(result.message);
          setFixTotal(Boolean(result.fixTotalBookId));
          return;
        case 'not_found':
          setDialogError('Esta sessão não existe mais.');
          return;
        case 'failed':
          if ('savedUpdatedAt' in result)
            controller.markSaved(result.savedUpdatedAt, after.current);
          setDialogError(result.message ?? 'Não foi possível publicar agora. Tente de novo.');
          return;
      }
    } catch {
      setDialogError('Sem conexão: não foi possível publicar agora. Tente de novo.');
    } finally {
      setBusy(false);
      setPublishing(false);
      if (!published) controller.setMode('draft');
    }
  };

  const confirmUnpublish = async () => {
    if (!sessionId) return;
    setBusy(true);
    setDialogError(null);
    try {
      const result = await unpublishSessionAction(sessionId);
      if (!result.ok) return setDialogError(result.message);
      await store.remove().catch(() => {});
      router.push(adminSessionsNoticeHref('rascunho', number));
    } catch {
      setDialogError('Sem conexão: não foi possível agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!sessionId) return;
    setBusy(true);
    setDialogError(null);
    try {
      const result = await deleteDraftAction(sessionId);
      if (!result.ok) return setDialogError(result.message);
      await store.remove().catch(() => {});
      router.push(adminSessionsNoticeHref('excluida'));
    } catch {
      setDialogError('Sem conexão: não foi possível agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const saving = state.status === 'saving';
  const hasUnsent = state.dirty;
  const canUnpublish = published && state.token !== null && session.commentCount === 0;

  return (
    <div className={styles.grid} data-editor-root>
      <div className={styles.main}>
        <div className={styles.topRow}>
          <span className={styles.chip}>
            <Icon name="book" size="sm" /> {book.title}
          </span>
          <span
            className={styles.status}
            data-status={state.status}
            role="status"
            aria-live="polite"
          >
            {statusLabel(state)}
          </span>
          {published ? (
            <Button
              size="sm"
              disabled={locked || !hasUnsent || saving || state.status === 'conflict'}
              onClick={() => void controller.saveNow()}
            >
              Salvar alterações
            </Button>
          ) : (
            <Button size="sm" disabled={locked} onClick={openPublish}>
              Publicar
            </Button>
          )}
        </div>

        {!ready && <p className={styles.muted}>Carregando o editor…</p>}

        {prompt && (
          <div className={`${styles.banner} ${styles.bannerWarn}`} role="alert">
            <p>
              <b>Encontramos alterações não salvas neste aparelho. Restaurar?</b>
              {prompt.serverChanged &&
                ' A sessão também mudou no servidor desde então: se você restaurar, vai poder escolher qual versão manter.'}
            </p>
            <div className={styles.bannerActions}>
              <Button size="sm" onClick={acceptRestore}>
                Restaurar
              </Button>
              <Button size="sm" variant="soft" onClick={declineRestore}>
                Descartar
              </Button>
            </div>
          </div>
        )}

        {state.conflict && (
          <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
            <p>
              <b>Esta sessão foi alterada em outro lugar</b> (outra aba ou outro aparelho) depois
              que você abriu. Escolha qual versão manter.
            </p>
            <div className={styles.bannerActions}>
              <Button size="sm" variant="soft" onClick={() => controller.acceptServerVersion()}>
                Carregar a versão do servidor
              </Button>
              <Button size="sm" onClick={() => void controller.overwriteWithMine()}>
                Sobrescrever com a minha
              </Button>
            </div>
          </div>
        )}

        {state.message && !state.conflict && (
          <p role="alert" className={`${styles.banner} ${styles.bannerError}`}>
            {state.message}
          </p>
        )}

        <div className={styles.meta}>
          <span>Sessão {number} · Capítulos</span>
          <ChapterField
            label="Do capítulo"
            value={current.chapterFrom}
            disabled={locked}
            onCommit={commitRange('chapterFrom')}
          />
          <span>a</span>
          <ChapterField
            label="Até o capítulo"
            value={current.chapterTo}
            disabled={locked}
            onCommit={commitRange('chapterTo')}
          />
        </div>

        {beyondTotal && (
          <p className={`${styles.banner} ${styles.bannerWarn}`}>
            O livro tem {book.totalChapters} capítulos e esta sessão vai até o {current.chapterTo}.
            Dá para continuar escrevendo, mas para publicar o total do livro precisa ser corrigido.{' '}
            <Link href={adminBookHref(book.id)}>Corrigir o total do livro</Link>
          </p>
        )}

        <input
          className={styles.title}
          type="text"
          maxLength={200}
          placeholder="Dê um título para esta sessão"
          aria-label="Título da sessão"
          value={current.title}
          disabled={locked}
          onChange={(event) => update({ title: event.target.value })}
        />
        {current.title.trim() === '' && (
          <p className={styles.suggest}>
            Sem ideia?{' '}
            <button type="button" disabled={locked} onClick={() => update({ title: suggested })}>
              Usar “{suggested}”
            </button>
          </p>
        )}

        <div className={styles.tabs}>
          <div className={styles.seg} role="tablist" aria-label="Escrever ou pré-visualizar">
            <button
              type="button"
              role="tab"
              id="aba-escrever"
              aria-selected={tab === 'write'}
              aria-controls="painel-escrever"
              onClick={() => setTab('write')}
            >
              Escrever
            </button>
            <button
              type="button"
              role="tab"
              id="aba-previa"
              aria-selected={tab === 'preview'}
              aria-controls="painel-previa"
              onClick={() => setTab('preview')}
            >
              Pré-visualizar
            </button>
          </div>
          <span className={styles.hint}>
            Dica: separe o relato por capítulo para o filtro de spoiler funcionar.
          </span>
        </div>

        <div
          id="painel-escrever"
          role="tabpanel"
          aria-labelledby="aba-escrever"
          hidden={tab !== 'write'}
        >
          <RichTextEditor
            initialContent={snapshot.body}
            editable={!locked}
            nextDivider={nextDivider}
            onChange={(body: BodyDoc) => update({ body })}
            onEditor={handleEditor}
          />
        </div>

        <div
          id="painel-previa"
          role="tabpanel"
          aria-labelledby="aba-previa"
          hidden={tab !== 'preview'}
        >
          <div className={styles.previewPaper}>
            <h2 className={styles.previewTitle}>{current.title || suggested}</h2>
            {words === 0 ? (
              <p className={styles.muted}>Ainda não há texto para mostrar.</p>
            ) : (
              <SessionBody doc={current.body} />
            )}
          </div>
        </div>

        <div className={styles.footRow}>
          <span>
            {words} {words === 1 ? 'palavra' : 'palavras'} · {minutes} min de leitura
          </span>
          {dividerCheck.blocking.length > 0 && (
            <span>
              {dividerCheck.blocking.length}{' '}
              {dividerCheck.blocking.length === 1 ? 'aviso' : 'avisos'} sobre as divisórias (veja
              “Capítulos desta sessão”)
            </span>
          )}
        </div>

        <NotesPanel sessionId={sessionId} initial={notes} beforeAction={beforeServerAction} />
        <QuestionsPanel
          sessionId={sessionId}
          initial={questions}
          beforeAction={beforeServerAction}
        />
      </div>

      <aside className={styles.side} aria-label="Opções da sessão">
        <section className={styles.card} aria-labelledby="publicacao-titulo">
          <h2 id="publicacao-titulo">Publicação</h2>
          <div className={styles.radioRow} role="radiogroup" aria-label="Quem pode ler">
            {(['public', 'members'] as const).map((value) => (
              <label key={value} className={styles.radio}>
                <input
                  type="radio"
                  name="visibility"
                  value={value}
                  checked={current.visibility === value}
                  disabled={locked}
                  onChange={() => updateAndSend({ visibility: value })}
                />
                <span>
                  {VISIBILITY_LABEL[value]}
                  <small>
                    {value === 'public'
                      ? 'Qualquer pessoa lê, só membros comentam'
                      : 'Precisa entrar para ler'}
                  </small>
                </span>
              </label>
            ))}
          </div>

          <div className={styles.actions}>
            {published ? (
              <>
                <Button
                  disabled={locked || !hasUnsent || saving || state.status === 'conflict'}
                  onClick={() => void controller.saveNow()}
                >
                  Salvar alterações
                </Button>
                <Button
                  variant="ghost"
                  disabled={locked || !hasUnsent}
                  onClick={() => controller.discard()}
                >
                  Descartar alterações
                </Button>
                <ButtonLink variant="soft" href={sessionHref(book.slug, number)}>
                  Ver no site
                </ButtonLink>
                {canUnpublish ? (
                  <Button
                    variant="ghost"
                    disabled={locked || hasUnsent}
                    onClick={() => {
                      setDialogError(null);
                      setDialog('unpublish');
                    }}
                  >
                    Voltar para rascunho
                  </Button>
                ) : (
                  session.commentCount > 0 && (
                    <p className={styles.muted}>
                      Esta sessão já tem comentários e não volta para rascunho. Para encerrar a
                      discussão, feche os comentários abaixo.
                    </p>
                  )
                )}
                {hasUnsent && (
                  <p className={styles.muted}>
                    Há alterações não salvas. Salve ou descarte antes de voltar para rascunho.
                  </p>
                )}
              </>
            ) : (
              <>
                <Button disabled={locked} onClick={openPublish}>
                  Publicar sessão
                </Button>
                <Button
                  variant="ghost"
                  disabled={locked || !hasUnsent}
                  onClick={() => void controller.flush()}
                >
                  Salvar rascunho
                </Button>
                {sessionId && (
                  <Button
                    variant="ghost"
                    danger
                    disabled={locked}
                    onClick={() => {
                      setDialogError(null);
                      setDialog('delete');
                    }}
                  >
                    Excluir rascunho
                  </Button>
                )}
              </>
            )}
          </div>
        </section>

        <section className={styles.card} aria-labelledby="discussao-titulo">
          <h2 id="discussao-titulo">Discussão</h2>
          <div className={styles.switchRow}>
            <div>
              <b id="abrir-comentarios">Abrir comentários</b>
              <small>Fechada, a sessão continua no ar, sem novos comentários</small>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={current.commentsOpen}
              aria-labelledby="abrir-comentarios"
              className={styles.switch}
              disabled={locked}
              onClick={() => updateAndSend({ commentsOpen: !current.commentsOpen })}
            />
          </div>
        </section>

        <ChaptersPanel
          editor={editor}
          body={current.body}
          from={current.chapterFrom}
          to={current.chapterTo}
          strict={published}
          disabled={locked}
        />

        <section className={styles.card} aria-labelledby="impressao-titulo">
          <h2 id="impressao-titulo">Impressão até aqui</h2>
          <StarPicker
            value={current.rating}
            disabled={locked}
            onChange={(rating) => updateAndSend({ rating })}
          />
        </section>

        <section className={styles.card} aria-labelledby="resumo-titulo">
          <h2 id="resumo-titulo">Resumo da lista</h2>
          <label className={styles.muted} htmlFor="resumo">
            Aparece nos cartões das sessões. Vazio = automático (o começo do relato).
          </label>
          <textarea
            id="resumo"
            className={styles.textarea}
            maxLength={300}
            placeholder={autoSummary || 'O primeiro parágrafo do relato'}
            value={current.excerpt}
            disabled={locked}
            onChange={(event) => update({ excerpt: event.target.value })}
          />
        </section>
      </aside>

      <ConfirmDialog
        open={dialog === 'publish'}
        title={`Publicar a sessão ${number}?`}
        confirmLabel="Publicar"
        busyLabel="Publicando…"
        busy={busy}
        disabled={dividerCheck.blocking.length > 0}
        error={
          dialogError && (
            <>
              {dialogError}
              {fixTotal && (
                <>
                  {' '}
                  <Link href={adminBookHref(book.id)}>Corrigir o total do livro</Link>
                </>
              )}
            </>
          )
        }
        onConfirm={() => void confirmPublish()}
        onClose={closeDialog}
      >
        <dl className={styles.summary}>
          <dt>Título</dt>
          <dd>{current.title.trim() || '(sem título: dê um título antes de publicar)'}</dd>
          <dt>Capítulos</dt>
          <dd>
            {current.chapterFrom === current.chapterTo
              ? `Capítulo ${current.chapterFrom}`
              : `Capítulos ${current.chapterFrom} a ${current.chapterTo}`}
          </dd>
          <dt>Quem lê</dt>
          <dd>{VISIBILITY_LABEL[current.visibility]}</dd>
          <dt>Comentários</dt>
          <dd>{current.commentsOpen ? 'Abertos' : 'Fechados'}</dd>
        </dl>
        {dividerCheck.blocking.length > 0 && (
          <ul className={styles.warnList}>
            {dividerCheck.blocking.map((issue, i) => (
              <li key={i} data-blocking="">
                {issue.message}
              </li>
            ))}
          </ul>
        )}
        {dividerCheck.warnings.length > 0 && (
          <p className={styles.muted}>
            {dividerCheck.warnings.length === 1
              ? '1 capítulo da faixa está sem divisória.'
              : `${dividerCheck.warnings.length} capítulos da faixa estão sem divisória.`}{' '}
            Dá para publicar mesmo assim.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'unpublish'}
        title={`Voltar a sessão ${number} para rascunho?`}
        confirmLabel="Voltar para rascunho"
        busyLabel="Voltando…"
        busy={busy}
        error={dialogError}
        onConfirm={() => void confirmUnpublish()}
        onClose={closeDialog}
      >
        <p>A sessão sai do site, mas o texto, os trechos e as perguntas continuam salvos.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'delete'}
        title="Excluir este rascunho?"
        confirmLabel="Excluir de vez"
        busyLabel="Excluindo…"
        busy={busy}
        danger
        error={dialogError}
        onConfirm={() => void confirmDelete()}
        onClose={closeDialog}
      >
        <p>O rascunho, os trechos e as perguntas dele serão apagados. Não dá para desfazer.</p>
      </ConfirmDialog>
    </div>
  );
}
