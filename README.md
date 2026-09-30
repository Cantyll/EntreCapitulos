# Entre Capítulos

Blog e clube de leitura em sessões, com discussão por capítulo e controle de spoiler.

- Protótipo navegável: `docs/prototype/entre-capitulos.html`
- Briefing técnico e de design: `CLAUDE.md`
- Referência do tema automático pela capa: `docs/theme-engine.reference.js`

## Stack
Next.js + TypeScript, Supabase (Postgres, Auth, Storage) e Vercel.

## Como rodar

Precisa de Node 20.9 ou superior (o `.nvmrc` indica o 22).

```bash
npm install
npm run dev
```

O site abre em http://localhost:3000 e o painel da administradora em http://localhost:3000/painel. Por enquanto o painel não tem login e as telas são esqueletos com dados de exemplo.

Outros comandos: `npm run lint`, `npm run typecheck`, `npm run format` e `npm run build`. A lista completa e a estrutura de pastas estão no `CLAUDE.md`.
