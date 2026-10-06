# Inventário de segurança do banco

> **Arquivo GERADO** do banco local (o que as migrations criam). Não edite à mão.
> Para regenerar, numa sessão de nuvem com o Supabase local de pé:
> `SECURITY_DOC_DB_CONTAINER=supabase_db_entre-capitulos UPDATE_SECURITY_DOC=1 npx vitest run tests/security-doc.test.ts`.
> O teste `tests/security-doc.test.ts` roda no CI (job do banco) e falha se este arquivo divergir do banco.

Mostra o desenho das permissões: quem lê e escreve o quê. **Não** mostra a configuração do painel do
Supabase na nuvem (Auth, Storage, e-mail), que se confere à mão (ver `docs/lancamento.md`). O contrato
que impede alargar permissões sem querer está em `supabase/tests/database/12_security_contract.test.sql`.

## Tabelas e row level security (RLS)

| Tabela | RLS ligado | RLS forçado ao dono |
| --- | --- | --- |
| `account_deletions` | sim | não |
| `books` | sim | não |
| `comment_flags` | sim | não |
| `comments` | sim | não |
| `member_audit` | sim | não |
| `member_suspensions` | sim | não |
| `profiles` | sim | não |
| `reading_progress` | sim | não |
| `reading_sessions` | sim | não |
| `session_notes` | sim | não |
| `session_questions` | sim | não |
| `site_page_drafts` | sim | não |
| `site_page_revisions` | sim | não |
| `site_pages` | sim | não |
| `terms_acceptances` | sim | não |

## Políticas de RLS

Inclui as políticas de `storage.objects` (bucket das capas). `USING` filtra o que se enxerga ou altera;
`WITH CHECK` valida o que se grava.

| Esquema.tabela | Política | Comando | Papéis | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| `public.books` | `books_delete_admin` | DELETE | authenticated | `( SELECT is_admin() AS is_admin)` |  |
| `public.books` | `books_insert_admin` | INSERT | authenticated |  | `( SELECT is_admin() AS is_admin)` |
| `public.books` | `books_select_public` | SELECT | anon, authenticated | `true` |  |
| `public.books` | `books_update_admin` | UPDATE | authenticated | `( SELECT is_admin() AS is_admin)` | `( SELECT is_admin() AS is_admin)` |
| `public.comment_flags` | `comment_flags_delete_staff` | DELETE | authenticated | `( SELECT is_staff() AS is_staff)` |  |
| `public.comment_flags` | `comment_flags_insert_staff` | INSERT | authenticated |  | `( SELECT is_staff() AS is_staff)` |
| `public.comment_flags` | `comment_flags_select_staff` | SELECT | authenticated | `( SELECT is_staff() AS is_staff)` |  |
| `public.comment_flags` | `comment_flags_update_staff` | UPDATE | authenticated | `( SELECT is_staff() AS is_staff)` | `( SELECT is_staff() AS is_staff)` |
| `public.comments` | `comments_insert_own` | INSERT | authenticated |  | `((author_id = ( SELECT auth.uid() AS uid)) AND (( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text))` |
| `public.comments` | `comments_select` | SELECT | anon, authenticated | `(((status = 'approved'::text) AND (EXISTS ( SELECT 1 FROM reading_sessions s WHERE (s.id = comments.session_id)))) OR (author_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_staff() AS is_staff))` |  |
| `public.comments` | `comments_update_staff` | UPDATE | authenticated | `( SELECT is_staff() AS is_staff)` | `( SELECT is_staff() AS is_staff)` |
| `public.member_audit` | `member_audit_select_admin` | SELECT | authenticated | `( SELECT is_admin() AS is_admin)` |  |
| `public.member_suspensions` | `member_suspensions_select` | SELECT | authenticated | `((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))` |  |
| `public.profiles` | `profiles_select_public` | SELECT | anon, authenticated | `true` |  |
| `public.profiles` | `profiles_update_own` | UPDATE | authenticated | `(id = ( SELECT auth.uid() AS uid))` | `(id = ( SELECT auth.uid() AS uid))` |
| `public.reading_progress` | `reading_progress_insert_own` | INSERT | authenticated |  | `(user_id = ( SELECT auth.uid() AS uid))` |
| `public.reading_progress` | `reading_progress_select_own` | SELECT | authenticated | `(user_id = ( SELECT auth.uid() AS uid))` |  |
| `public.reading_progress` | `reading_progress_update_own` | UPDATE | authenticated | `(user_id = ( SELECT auth.uid() AS uid))` | `(user_id = ( SELECT auth.uid() AS uid))` |
| `public.reading_sessions` | `reading_sessions_delete_admin` | DELETE | authenticated | `( SELECT is_admin() AS is_admin)` |  |
| `public.reading_sessions` | `reading_sessions_insert_admin` | INSERT | authenticated |  | `( SELECT is_admin() AS is_admin)` |
| `public.reading_sessions` | `reading_sessions_select` | SELECT | anon, authenticated | `(((status = 'published'::text) AND (visibility = 'public'::text)) OR ((status = 'published'::text) AND (visibility = 'members'::text) AND (( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT (auth.jwt() ->> 'is_anonymous'::text)) IS DISTINCT FROM 'true'::text)) OR ( SELECT is_admin() AS is_admin))` |  |
| `public.reading_sessions` | `reading_sessions_update_admin` | UPDATE | authenticated | `( SELECT is_admin() AS is_admin)` | `( SELECT is_admin() AS is_admin)` |
| `public.session_notes` | `session_notes_delete_admin` | DELETE | authenticated | `( SELECT is_admin() AS is_admin)` |  |
| `public.session_notes` | `session_notes_insert_admin` | INSERT | authenticated |  | `( SELECT is_admin() AS is_admin)` |
| `public.session_notes` | `session_notes_select` | SELECT | anon, authenticated | `(EXISTS ( SELECT 1 FROM reading_sessions s WHERE (s.id = session_notes.session_id)))` |  |
| `public.session_notes` | `session_notes_update_admin` | UPDATE | authenticated | `( SELECT is_admin() AS is_admin)` | `( SELECT is_admin() AS is_admin)` |
| `public.session_questions` | `session_questions_delete_admin` | DELETE | authenticated | `( SELECT is_admin() AS is_admin)` |  |
| `public.session_questions` | `session_questions_insert_admin` | INSERT | authenticated |  | `( SELECT is_admin() AS is_admin)` |
| `public.session_questions` | `session_questions_select` | SELECT | anon, authenticated | `(EXISTS ( SELECT 1 FROM reading_sessions s WHERE (s.id = session_questions.session_id)))` |  |
| `public.session_questions` | `session_questions_update_admin` | UPDATE | authenticated | `( SELECT is_admin() AS is_admin)` | `( SELECT is_admin() AS is_admin)` |
| `public.site_page_drafts` | `site_page_drafts_select_admin` | SELECT | authenticated | `( SELECT is_admin() AS is_admin)` |  |
| `public.site_page_revisions` | `site_page_revisions_select_admin` | SELECT | authenticated | `( SELECT is_admin() AS is_admin)` |  |
| `public.site_pages` | `site_pages_select_public` | SELECT | anon, authenticated | `true` |  |
| `public.terms_acceptances` | `terms_acceptances_select_own` | SELECT | authenticated | `(user_id = ( SELECT auth.uid() AS uid))` |  |
| `storage.objects` | `covers_delete_admin` | DELETE | authenticated | `((bucket_id = 'covers'::text) AND ( SELECT is_admin() AS is_admin))` |  |
| `storage.objects` | `covers_insert_admin` | INSERT | authenticated |  | `((bucket_id = 'covers'::text) AND ( SELECT is_admin() AS is_admin))` |
| `storage.objects` | `covers_select_admin` | SELECT | authenticated | `((bucket_id = 'covers'::text) AND ( SELECT is_admin() AS is_admin))` |  |
| `storage.objects` | `covers_update_admin` | UPDATE | authenticated | `((bucket_id = 'covers'::text) AND ( SELECT is_admin() AS is_admin))` | `((bucket_id = 'covers'::text) AND ( SELECT is_admin() AS is_admin))` |

## Permissões nas tabelas (anon e authenticated)

Permissão na tabela inteira. O RLS ainda se aplica a cada uma delas.

| Tabela | Papel | Permissões |
| --- | --- | --- |
| `books` | anon | SELECT |
| `books` | authenticated | DELETE, INSERT, SELECT, UPDATE |
| `comment_flags` | authenticated | DELETE, SELECT |
| `comments` | anon | SELECT |
| `comments` | authenticated | SELECT |
| `member_audit` | authenticated | SELECT |
| `member_suspensions` | authenticated | SELECT |
| `profiles` | anon | SELECT |
| `profiles` | authenticated | SELECT |
| `reading_progress` | authenticated | SELECT |
| `reading_sessions` | anon | SELECT |
| `reading_sessions` | authenticated | DELETE, INSERT, SELECT, UPDATE |
| `session_notes` | anon | SELECT |
| `session_notes` | authenticated | DELETE, INSERT, SELECT, UPDATE |
| `session_questions` | anon | SELECT |
| `session_questions` | authenticated | DELETE, INSERT, SELECT, UPDATE |
| `site_page_drafts` | authenticated | SELECT |
| `site_page_revisions` | authenticated | SELECT |
| `site_pages` | anon | SELECT |
| `site_pages` | authenticated | SELECT |
| `terms_acceptances` | authenticated | SELECT |

## Permissões por coluna (anon e authenticated)

Onde a escrita é limitada a certas colunas.

| Tabela | Papel | Permissão | Colunas |
| --- | --- | --- | --- |
| `comment_flags` | authenticated | INSERT | `comment_id, reason` |
| `comment_flags` | authenticated | UPDATE | `reason` |
| `comments` | authenticated | INSERT | `id, session_id, author_id, parent_id, body, read_up_to, spoiler_up_to` |
| `comments` | authenticated | UPDATE | `spoiler_up_to, status` |
| `profiles` | authenticated | UPDATE | `display_name, display_name_confirmed_at` |
| `reading_progress` | authenticated | INSERT | `user_id, book_id, chapter` |
| `reading_progress` | authenticated | UPDATE | `chapter` |

## Funções do esquema `public`

`security definer` roda com os direitos do dono da função, por isso precisa de `search_path` vazio. As
colunas "anon", "authenticated" e "PUBLIC" dizem quem pode executar pela API.

| Função | Trigger | security definer | search_path | anon | authenticated | PUBLIC |
| --- | --- | --- | --- | --- | --- | --- |
| `accept_terms(p_version text)` | não | sim | `"" (vazio)` | não | sim | não |
| `admin_delete_member(p_user_id uuid)` | não | sim | `"" (vazio)` | não | sim | não |
| `admin_find_member_by_email(p_email text)` | não | sim | `"" (vazio)` | não | sim | não |
| `admin_masked_emails(p_user_ids uuid[])` | não | sim | `"" (vazio)` | não | sim | não |
| `admin_member_contact(p_user_id uuid)` | não | sim | `"" (vazio)` | não | sim | não |
| `admin_member_export(p_user_id uuid)` | não | sim | `"" (vazio)` | não | sim | não |
| `comments_before_insert()` | sim | sim | `"" (vazio)` | não | não | não |
| `comments_flag_links()` | sim | sim | `"" (vazio)` | não | não | não |
| `comments_rate_limit()` | sim | sim | `"" (vazio)` | não | não | não |
| `comments_sync_approved_count()` | sim | sim | `"" (vazio)` | não | não | não |
| `delete_account_cascade(p_user_id uuid)` | não | não | `"" (vazio)` | não | não | não |
| `delete_my_account()` | não | sim | `"" (vazio)` | não | sim | não |
| `derive_avatar_url(meta jsonb)` | não | não | `"" (vazio)` | não | não | não |
| `derive_display_name(meta jsonb)` | não | não | `"" (vazio)` | não | não | não |
| `finish_book(p_book_id uuid, p_rating numeric)` | não | não | `"" (vazio)` | não | sim | não |
| `handle_new_user()` | sim | sim | `"" (vazio)` | não | não | não |
| `is_admin()` | não | sim | `"" (vazio)` | sim | sim | não |
| `is_staff()` | não | sim | `"" (vazio)` | sim | sim | não |
| `mask_email(p_email text)` | não | não | `"" (vazio)` | não | não | não |
| `publish_session(p_session_id uuid)` | não | não | `"" (vazio)` | não | sim | não |
| `publish_site_page(p_slug text, p_expected_updated_at text)` | não | sim | `"" (vazio)` | não | sim | não |
| `purge_account_deletions()` | não | não | `"" (vazio)` | não | não | não |
| `reading_sessions_set_published_at()` | sim | não | `"" (vazio)` | não | não | não |
| `restore_site_page_revision(p_slug text, p_revision_id bigint, p_expected_updated_at text)` | não | sim | `"" (vazio)` | não | sim | não |
| `retract_comment(p_comment_id uuid)` | não | sim | `"" (vazio)` | não | sim | não |
| `save_site_page_draft(p_slug text, p_content jsonb, p_expected_updated_at text)` | não | sim | `"" (vazio)` | não | sim | não |
| `set_member_role(p_user_id uuid, p_role text, p_expected_role text)` | não | sim | `"" (vazio)` | não | sim | não |
| `set_member_suspension(p_user_id uuid, p_suspended boolean)` | não | sim | `"" (vazio)` | não | sim | não |
| `set_updated_at()` | sim | não | `"" (vazio)` | não | não | não |
| `site_page_content_problem(p_slug text, p_content jsonb)` | não | não | `"" (vazio)` | não | não | não |
| `start_book(p_book_id uuid)` | não | não | `"" (vazio)` | não | sim | não |
| `unpublish_session(p_session_id uuid)` | não | não | `"" (vazio)` | não | sim | não |
