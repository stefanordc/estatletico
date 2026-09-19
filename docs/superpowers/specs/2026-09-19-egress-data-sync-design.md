# Redução de egress com sincronização incremental

## Objetivo

Manter todos os resultados, filtros, cadastros e atualizações imediatas do Estatlético, reduzindo a transferência do Supabase que hoje ocorre nas cargas completas e na recuperação de foco da aba.

O cliente continuará refletindo inserções, edições e exclusões sem recarregar a página. Uma aba que ficou desconectada ou fechada será reconciliada ao retornar, sem baixar novamente tabelas que não mudaram.

## Diagnóstico confirmado

O cliente em Supabase executa `select('*')`, paginado e completo, para as seis tabelas (`adversarios`, `arbitros`, `competicoes`, `estadios`, `jogadores` e `jogos`) no início. Ele repete a mesma leitura integral quando a aba recebe foco, após sessenta segundos. O IndexedDB acelera a primeira renderização, mas não impede essas respostas de rede.

A medição em transação PostgreSQL somente leitura encontrou os maiores campos serializados:

| Campo | JSON bruto atual |
| --- | ---: |
| `jogadores.foto` | 27.37 MB |
| `arbitros.foto` | 5.29 MB |
| `estadios.foto` | 4.35 MB |
| `adversarios.escudo` | 1.52 MB |
| `jogos.lineupGalo` | 4.48 MB |

Só a mídia de cadastro corresponde a aproximadamente 38.5 MB antes da serialização da resposta HTTP em cada carga integral. As seis tabelas não têm `updated_at`; por isso, total de linhas, maior ID ou cache por tempo não podem detectar corretamente uma edição ou exclusão.

As seis tabelas pertencem hoje à publicação `supabase_realtime`. O handler atual já aplica cada evento recebido ao estado e cache locais, mas Postgres Changes transmite a linha inteira: uma edição pequena pode reenviar uma foto Base64 ou JSON grande.

## Escopo e compatibilidade

Esta mudança cobre todo acesso de leitura usado pela aplicação publicada:

- carga inicial e paginação das seis tabelas;
- reconciliação quando a aba recupera foco ou a conexão Realtime é refeita;
- consultas de autocompletar de jogadores;
- busca pontual de foto de jogador;
- atualizações em tempo real de INSERT, UPDATE e DELETE;
- cache IndexedDB e suas invalidações.

O provider MySQL preservará a mesma interface e não ganha chamadas ao Supabase. Scripts de cópia e sincronização administrativa continuam fora do caminho de leitura do site. Os resultados calculados no navegador e o formato dos registros em `state` não mudam.

## Desenho aprovado

### 1. Dados principais e mídia sob demanda

Cada tabela terá uma projeção principal explícita. Ela conterá todas as colunas necessárias aos cálculos e à interface, mas excluirá os campos de mídia `jogadores.foto`, `arbitros.foto`, `estadios.foto` e `adversarios.escudo`.

Os quatro campos serão carregados por ID apenas quando um componente realmente precisar mostrá-los. Eles ficarão em uma área de cache IndexedDB separada, indexada por tabela, ID e revisão. Uma imagem já carregada não será solicitada de novo até o registro correspondente mudar. Ao receber mudança ou exclusão, o cache de mídia daquele registro será invalidado ou removido antes da nova renderização.

`jogos.lineupGalo`, cartões e demais campos de jogo permanecem inicialmente na projeção principal: eles participam dos resultados e estatísticas existentes. A arquitetura deixa esses campos isolados para uma segunda otimização, guiada por nova medição, sem alterar a semântica agora.

### 2. Diário de revisões durável

Uma migração criará uma tabela de diário com uma revisão monotônica, tabela afetada, ID do registro, operação (`INSERT`, `UPDATE` ou `DELETE`) e instante de gravação. Triggers `AFTER` nas seis tabelas escreverão uma entrada na mesma transação que alterou o dado.

O diário terá retenção documentada e superior ao período de cache aceito. A consulta será protegida por RLS para as mesmas pessoas que já podem ler os dados da aplicação. Se o cursor local estiver antes da retenção, o cliente fará uma carga principal completa e reiniciará seu cursor; nunca assumirá que um cache antigo ainda é válido.

O diário resolve alterações e exclusões mesmo que a aba estivesse fechada. Ele substitui a atual leitura completa ao ganhar foco por páginas pequenas de revisões desde o último cursor.

### 3. Realtime compacto e seguro

As triggers também enviarão um Broadcast privado no tópico único da aplicação com payload mínimo:

```json
{ "revision": 1234, "table": "jogadores", "id": "42", "operation": "UPDATE" }
```

Será usado `realtime.send`, e não `realtime.broadcast_changes`, para que o evento não inclua a linha inteira. A função de trigger ficará em esquema não exposto, com `search_path` fixado e execução pública revogada. As políticas de `realtime.messages` concederão apenas a usuários autenticados a permissão de receber mensagens do tópico privado.

O cliente assinará o Broadcast antes de iniciar a reconciliação. Para INSERT e UPDATE, buscará somente a projeção principal do ID informado e aplicará o registro ao estado, cache e tela. Para DELETE, removerá o ID e sua mídia do estado e cache sem nova consulta. Revisões duplicadas ou entregues fora de ordem serão idempotentes: o estado final será o da maior revisão aplicada.

Após a validação do Broadcast, o cliente deixará de assinar `postgres_changes`, e somente as seis tabelas desta aplicação serão removidas da publicação antiga. Não será removido nem recriado nenhum objeto Realtime desconhecido.

### 4. Carga, reconexão e consistência

Na primeira abertura sem cache válido, o cliente obterá um cursor de revisão, carregará as seis projeções principais paginadas e então aplicará todas as revisões posteriores ao cursor. Assim, uma alteração concorrente não se perde durante a carga.

Com cache, a abertura e o evento `focus` consultarão apenas o diário a partir do cursor salvo. O mesmo processo acontecerá quando Broadcast informar queda, timeout ou reconexão. O novo fluxo usará retentativa limitada com backoff e mostrará estado de sincronização se a reconciliação falhar; não voltará silenciosamente à recarga integral repetida.

### 5. Consultas e índices

As cargas de tabela continuarão ordenadas pela PK, já indexada em todas as seis tabelas. O diário terá índice pela revisão e por sua retenção. As consultas de autocompletar continuarão com a projeção atual e limite de 10 ou 20 linhas; serão avaliadas com `EXPLAIN (ANALYZE, BUFFERS)` antes de qualquer índice. Caso o plano com dados reais justifique, serão adicionados índices trigram para as buscas `ILIKE` de jogadores e um índice por temporada, sem mudar resultados.

Não serão adicionados índices apenas por suposição, nem índices sobre colunas de mídia ou JSON que não participam de filtros.

## Segurança

As novas tabelas expostas terão RLS habilitada e políticas explícitas. A tabela de diário contém apenas metadados de sincronização, não fotos ou registros. Funções privilegiadas serão privadas, terão `search_path` seguro e não receberão `EXECUTE` por `PUBLIC`. A política de Broadcast corresponderá ao acesso de leitura já permitido aos dados.

## Verificação

Os testes cobrirão:

1. Projeções principais sem os quatro campos de mídia, sem alteração do formato final em `state` após a hidratação sob demanda.
2. Cache de mídia: uma imagem é buscada uma vez, é invalidada por UPDATE e removida por DELETE.
3. Reconciliação de INSERT, UPDATE e DELETE por diário, inclusive revisões repetidas, fora de ordem e cursor expirado.
4. Evento Broadcast ao vivo aplicado sem reload, com apenas a busca do registro afetado.
5. Equivalência: um estado produzido pela carga completa de fixture é idêntico ao produzido por cache mais diário.
6. Regressão de tráfego: foco e reconexão não executam `select('*')` nas seis tabelas; eventos não carregam campos de mídia.
7. Migração no Supabase: RLS, permissões, triggers, índices e políticas de Broadcast verificados por consultas reais e advisors.

## Lançamento e medição

O lançamento será em duas etapas compatíveis: primeiro a migração de diário e o cliente capaz de fazer reconciliação incremental; depois Broadcast privado e retirada das assinaturas Postgres Changes. Antes e depois, serão registrados o número de respostas, bytes HTTP de dados e egress Realtime no painel Supabase. A economia não será declarada sem essas medições.

Migrar as imagens Base64 para Supabase Storage, com URLs versionadas e cache CDN, fica deliberadamente fora desta etapa. É uma segunda redução possível, mas não é necessária para remover a transferência recorrente de aproximadamente 38.5 MB de mídia por carga principal.
