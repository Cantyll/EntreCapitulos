import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { legalConfig } from '../legal-config';
import { buildPrivacy } from './privacy';
import { buildTerms } from './terms';
import type { LegalDoc } from './types';

/*
 * Etapa 8g (adequações legais): os textos novos de /termos e /privacidade, exatamente como o dono do site os pediu,
 * e as regras que não podem voltar atrás (nada de 16 anos, nada de número de resolução nos textos públicos).
 */

const flat = (doc: LegalDoc): string =>
  doc.sections
    .flatMap((section) => [
      section.title,
      ...section.blocks.flatMap((block) => {
        switch (block.type) {
          case 'p':
          case 'note':
            return [block.text];
          case 'ul':
            return [...block.items];
          case 'table':
            return [block.caption, ...block.head, ...block.rows.flat()];
        }
      }),
    ])
    .join('\n');

const ON = { google: true, turnstile: true };
const terms = buildTerms(legalConfig);
const privacy = buildPrivacy(legalConfig, ON);

describe('/termos (etapa 8g)', () => {
  const text = flat(terms);

  it('responsabilidade pelo conteúdo dos usuários, exatamente como pedida', () => {
    expect(text).toContain(
      'O Entre Capítulos não se responsabiliza pelo conteúdo gerado pelos usuários (comentários), sendo a responsabilidade civil e penal exclusiva de seus autores.',
    );
  });

  it('cumprimento de ordem judicial específica de remoção de conteúdo', () => {
    expect(text).toContain('O site cumpre ordem judicial específica de remoção de conteúdo.');
  });

  it('exige 18 anos ou mais (declaração) e diz que o aceite é registrado enquanto a conta existir', () => {
    expect(text).toContain('O clube é destinado a pessoas com 18 anos ou mais.');
    expect(text).toContain('você declara ter essa idade');
    expect(text).toContain('O site não verifica a idade de quem cria a conta.');
    expect(text).toContain(
      'O aceite (a versão destes Termos e a data) fica registrado enquanto a sua conta existir.',
    );
    expect(text).toContain('Sem o aceite você pode ler as sessões, mas não pode comentar.');
  });

  it('o foro de Sinop/MT é a ÚLTIMA seção, com a frase pedida', () => {
    const last = terms.sections[terms.sections.length - 1]!;
    expect(last.id).toBe('foro');
    expect(last.title).toBe('10. Foro');
    expect(flat({ ...terms, sections: [last] })).toContain(
      'Fica eleito o foro da Comarca de Sinop/MT para dirimir quaisquer dúvidas ou litígios decorrentes destes Termos, renunciando as partes a qualquer outro, por mais privilegiado que seja.',
    );
  });
});

describe('/privacidade (etapa 8g)', () => {
  const text = flat(privacy);

  it('o registro mínimo de exclusões, com o texto pedido, na seção de retenção', () => {
    const retention = flat({
      ...privacy,
      sections: privacy.sections.filter((section) => section.id === 'retencao'),
    });
    expect(retention).toContain(
      'Caso haja a restauração de um backup, mantemos um registro mínimo, seguro e inacessível ao público (apenas um identificador técnico e a data) com o único objetivo de garantir que contas e dados já excluídos por você não sejam recriados acidentalmente.',
    );
    expect(retention).toContain('Esse registro é mantido por 56 dias');
  });

  it('a base legal do registro mínimo é "cumprimento de obrigação legal" e vira proposta a validar', () => {
    expect(text).toContain('Base legal do registro mínimo de exclusões:');
    expect(text).toContain('Cumprimento de obrigação legal ou regulatória (art. 7º, II, da LGPD)');
  });

  it('descreve o aceite dos Termos (versão e datas) e o registro de exclusões entre os dados tratados', () => {
    const data = flat({
      ...privacy,
      sections: privacy.sections.filter((section) => section.id === 'dados'),
    });
    expect(data).toContain('Aceite dos Termos: a versão dos Termos de Uso');
    expect(data).toContain('a data do primeiro aceite e a do último');
    expect(data).toContain('Registro mínimo de exclusões: quando uma conta é excluída');
    expect(data).toContain(
      'apenas um identificador técnico e a data da exclusão, sem nome, e-mail nem texto',
    );
  });

  it('o encarregado está dispensado e o e-mail de contato é o canal', () => {
    expect(text).toContain('fica dispensado de indicar um encarregado');
    expect(text).toContain(
      `O canal para os titulares falarem com a gente é o e-mail de contato: ${legalConfig.privacyContactEmail}.`,
    );
  });

  it('nenhum texto público cita número de resolução da ANPD', () => {
    for (const doc of [
      flat(terms),
      text,
      flat(buildPrivacy(legalConfig, { google: false, turnstile: false })),
    ]) {
      expect(doc).not.toMatch(/Resolu[çc][ãa]o|ANPD n[ºo]|CD\/ANPD/);
    }
  });

  it('o registro de exclusões e a retenção das cópias dizem 56 dias, como o backup.config.json', () => {
    const backup = JSON.parse(
      readFileSync(join(process.cwd(), '.github/backup.config.json'), 'utf8'),
    ) as { retentionDays: { daily: number; weekly: number } };
    expect(backup.retentionDays.weekly).toBe(56);
    expect(text).toContain(`${backup.retentionDays.daily} dias (as diárias)`);
    expect(text).toContain(`${backup.retentionDays.weekly} dias (as semanais)`);
  });

  it('a frase "Buscamos as garantias da LGPD pelos termos de tratamento de dados da Cloudflare" fica nas cópias, como proposta', () => {
    expect(text).toContain(
      'Buscamos as garantias da LGPD pelos termos de tratamento de dados da Cloudflare.',
    );
    expect(legalConfig.backups.internationalTransfer).toContain('fora do Brasil');
  });
});

describe('o que não pode voltar', () => {
  it('nenhum arquivo versionado cita número de resolução errado para a transferência (a referência é a nº 19/2024)', () => {
    const wrong = ['15', '2024'].join('/');
    const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
      .split('\n')
      .filter((file) => file && !/\.(png|jpg|jpeg|gif|webp|ico|woff2?)$/.test(file));
    const offenders = files.filter((file) => {
      try {
        return readFileSync(join(process.cwd(), file), 'utf8').includes(wrong);
      } catch {
        return false;
      }
    });
    expect(offenders).toEqual([]);
  });

  it('nenhum texto legal nem a configuração falam em 16 anos', () => {
    for (const text of [flat(terms), flat(privacy), JSON.stringify(legalConfig)]) {
      expect(text).not.toMatch(/\b16 anos\b/);
    }
  });
});
