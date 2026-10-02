import { z } from 'zod';

/*
 * No NAVEGADOR o zod roda sem o modo "JIT" (que compila validadores com `new Function`). A Content-Security-Policy
 * não aceita 'unsafe-eval' em produção, e o zod só TESTA se o eval funciona com um `new Function('')` que a CSP
 * bloqueia e REPORTA como violação, mesmo que a falha seja tratada. Em `jitless` ele nem tenta. No servidor o
 * JIT continua ligado (lá não há CSP). Importe este módulo ANTES de criar qualquer schema do zod.
 */
if (typeof window !== 'undefined') {
  z.config({ jitless: true });
}
