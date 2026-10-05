import type { Metadata } from 'next';

import { DeleteAccountForm } from '@/components/conta/DeleteAccountForm';
import { InstallAccountSection } from '@/components/install/InstallAccountSection';
import { NameForm } from '@/components/conta/NameForm';
import styles from '@/components/conta/conta.module.css';
import { PageHeader } from '@/components/site/PageHeader';
import { ButtonAnchor } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { logFailure } from '@/lib/auth/log';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Minha conta', robots: { index: false, follow: false } };

/** O e-mail aparece só para a própria pessoa. Sem ele a página continua funcionando. */
async function readEmail(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
  } catch (error) {
    logFailure('conta: e-mail', error);
    return null;
  }
}

export default async function AccountPage() {
  const user = await requireUser();
  const email = await readEmail();
  const isStaff = user.role !== 'member';
  // "Leitor" é o nome de reserva do banco: nesse caso o campo começa vazio.
  const initialName = user.displayName === 'Leitor' ? '' : user.displayName;

  return (
    <Container>
      <PageHeader
        title="Minha conta"
        lead="Seu nome, seus dados e a exclusão da conta."
        back={{ href: '/', label: 'Voltar para o início' }}
      />
      <div className={styles.stack}>
        {email && (
          <section className={styles.card} aria-labelledby="conta-email-titulo">
            <h2 id="conta-email-titulo">Seu e-mail</h2>
            <p>
              <span className={styles.email}>{email}</span>
            </p>
            <p className={styles.hint}>
              Usamos o e-mail só para você entrar. Ele não aparece para outras pessoas.
            </p>
          </section>
        )}

        <NameForm initialName={initialName} />

        {/* Só no Safari do iPhone/iPad fora do app instalado: decide no navegador, depois da montagem. */}
        <InstallAccountSection />

        <section className={styles.card} aria-labelledby="conta-dados-titulo">
          <h2 id="conta-dados-titulo">Baixar meus dados</h2>
          <p>
            Um arquivo com o que guardamos sobre você: perfil, e-mail, todos os seus comentários
            (inclusive os que estão em análise ou foram removidos) e até que capítulo você leu em
            cada livro.
          </p>
          <div className={styles.actions}>
            <ButtonAnchor href="/conta/dados" download variant="soft">
              Baixar meus dados
            </ButtonAnchor>
          </div>
        </section>

        <section
          className={`${styles.card} ${styles.danger}`}
          aria-labelledby="conta-excluir-titulo"
        >
          <h2 id="conta-excluir-titulo">Excluir minha conta</h2>
          {isStaff ? (
            <p>
              Esta conta tem papel de equipe ({ROLE_LABELS.admin} ou {ROLE_LABELS.moderator}), e
              contas da equipe não podem ser excluídas por aqui. Para excluir, a conta precisa
              perder o papel de equipe antes: peça isso à {ROLE_LABELS.admin.toLowerCase()} do site.
            </p>
          ) : (
            <>
              <p>A exclusão apaga a sua conta e não tem volta. Ao excluir:</p>
              <ul>
                <li>seu perfil e seu e-mail saem do site;</li>
                <li>
                  todos os seus comentários são apagados, e as respostas que outras pessoas
                  escreveram a eles também;
                </li>
                <li>seu progresso de leitura é apagado;</li>
                <li>você sai da conta neste aparelho.</li>
              </ul>
              <p>
                Se só quer apagar um comentário, use “Excluir meu comentário” embaixo dele, na
                página da sessão.
              </p>
              <DeleteAccountForm />
            </>
          )}
        </section>
      </div>
    </Container>
  );
}
