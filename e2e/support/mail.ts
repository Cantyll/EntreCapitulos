import { expect } from '@playwright/test';

import { keys } from './stack';

/** Espera o e-mail chegar ao Mailpit local e devolve o código de 6 dígitos. */
export async function codeFor(email: string): Promise<string> {
  const base = keys().mailpitUrl;
  let code = '';
  await expect
    .poll(
      async () => {
        const list = (await (
          await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
        ).json()) as {
          messages?: { ID: string }[];
        };
        const id = list.messages?.[0]?.ID;
        if (!id) return '';
        const message = (await (await fetch(`${base}/api/v1/message/${id}`)).json()) as {
          Text?: string;
        };
        code = /\b(\d{6})\b/.exec(message.Text ?? '')?.[1] ?? '';
        return code;
      },
      { message: `e-mail com o código para ${email}` },
    )
    .toMatch(/^\d{6}$/);
  return code;
}
