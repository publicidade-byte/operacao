# Versões autocontidas para deploy pelo painel

Estes arquivos são gerados a partir de `supabase/functions/`, com o módulo
`_shared/comum.ts` embutido — o editor do painel do Supabase publica um
arquivo por função.

**A fonte de verdade é `supabase/functions/`.** Ao alterar uma função lá,
regenere estes arquivos antes de publicar pelo painel.

O caminho normal de deploy continua sendo a CLI:

```bash
supabase functions deploy criar-solicitacao --project-ref tvszasxlyyeibhafofsa --no-verify-jwt
```
