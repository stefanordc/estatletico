# Auditoria de dados e tráfego

## Rollout incremental de egress — 19/09/2026

O Supabase recebeu `supabase_egress_incremental_sync.sql`. A verificação ao vivo confirmou RLS no diário `estatletico_change_log`, uma política de leitura `authenticated`, seis triggers de captura e nenhum EXECUTE público em `estatletico_private.capture_change()`.

O navegador carrega projeções explícitas sem `jogadores.foto`, `arbitros.foto`, `estadios.foto` e `adversarios.escudo`; mídia é cacheada por registro no IndexedDB e requisitada sob demanda. Em vez de Postgres Changes com linhas completas, o banco envia no tópico privado `estatletico:sync` apenas revisão, tabela, id e operação. O cliente lê as páginas do diário, resolve apenas INSERT/UPDATE alterados e trata DELETE sem leitura da linha. O cache incremental expira após 30 dias e o diário retém 35 dias.

A prova transacional no banco inseriu, alterou, repetiu uma alteração idêntica e excluiu um adversário de teste; o diário recebeu exatamente `INSERT`, `UPDATE`, `DELETE`, sem evento do update idêntico, e o rollback não preservou linha de teste. Os dois formatos de autocomplete de jogadores foram executados com `EXPLAIN (ANALYZE, BUFFERS)` e retornaram planos `Limit`; com o volume atual não foi criado índice novo, pois a auditoria não demonstrou benefício material.

Referência prévia de tráfego: os quatro campos de mídia totalizavam aproximadamente 38,5 MB de JSON cru por carga completa. O valor deve ser comparado com o painel Usage → Egress após uso real; não há economia percentual declarada sem essa medição.

## Estrutura identificada antes das edições

- `index.html`, `style.css`, `app.js`: aplicação estática efetivamente publicada, com manipulação direta do DOM e Chart.js.
- `player-autofill-utils.js`: regras compartilhadas de identidade e preenchimento de atletas; testes existentes preservados.
- `estatletico.jsx`: protótipo React com dados locais; não carregado por `index.html`, sem integração Supabase.
- Nenhum backend, API própria, package.json, `.env.example` ou `.gitignore` existia no projeto.
- Os três SQLs existentes tratam de RLS, publicação Realtime e referências/identidade de jogadores. Permaneceram intactos.
- Não foi encontrada configuração Sites/`.openai/hosting.json`.

## Tabelas e dependências

| Tabela | Uso |
|---|---|
| adversarios | Clubes, escudos, país/estado; referenciada por jogos.adversarioId |
| estadios | Estádios, localização, mandante, foto |
| competicoes | Campeonato e tipo |
| arbitros | Nome, federação, foto |
| jogadores | Um cadastro por temporada; id é a PK do cadastro, id_jogador agrupa a pessoa |
| jogos | Partidas, temporadas, placares, público/renda, escalações e cartões em JSON |

Na cópia real de 7 de setembro de 2026 foram migrados: 164 adversários, 750 árbitros, 15 competições, 165 estádios, 1.084 jogadores e 1.444 jogos. O PostgreSQL continha pares históricos de campos em `jogos` cujo nome só mudava por maiúsculas/minúsculas. Como o MySQL não aceita ambos com o mesmo nome lógico, os quatro campos legados foram preservados como `_legacy_gcfavorcount`, `_legacy_gcfavorlist`, `_legacy_gccontracount` e `_legacy_gccontralist`; os campos em camelCase usados pelo site mantiveram seus nomes.

O esquema completo não está versionado. Tipos, índices, constraints, tabelas adicionais e objetos efetivamente instalados só podem ser confirmados pelo catálogo PostgreSQL. `db:inspect`/`db:copy` fazem essa descoberta; não foi inventado um schema de produção a partir dos formulários.

## Todos os pontos de integração encontrados em app.js

| Local/função | Operação original | Tratamento |
|---|---|---|
| Inicialização, duas ocorrências de createClient | Cliente Supabase | Provider central, memoizado; ramo Supabase preservado |
| setupAuthUI, submissão de login/cadastro, logout | signUp, signInWithPassword, signOut | Auth original no remoto; sessão HTTP local e senha local na contingência |
| Entrada DOMContentLoaded | getSession, onAuthStateChange | Provider de autenticação selecionado |
| saveData | from(key).upsert(safeData) nas seis tabelas | API → repository MySQL; demais preferências continuam em localStorage |
| hydratePlayersForSeason | jogadores, projeção de 8 campos, eq temporada, ilike nome_guerra, limit 20 | Mesma projeção/filtros/limite; cache de consultas invalidado ao mudar jogadores |
| Preenchimento por nome completo | jogadores, projeção de 8 campos, ilike nome_completo, order temporada DESC, limit 10; fallback flexível | Implementado com parâmetros preparados, LOWER/LIKE e ordenação |
| Exclusão de jogo | jogos.delete().eq(id) | Exclusão local autenticada, somente por PK completa |
| Exclusão de cadastro | from(tab).delete().eq(id) | Mesmo controle local por PK e tabela permitida |
| fetchTableWithPagination | select('*').range(...) nas seis tabelas | Provider; adicionada ordenação estável por id |
| refreshCadastrosFromServer | select('*') sem paginação em cinco tabelas a cada foco | Paginação completa, intervalo mínimo de 60s; inclui jogos e detecta edições com o mesmo ID |
| startRealtimeSync | channel/on postgres_changes/subscribe nas seis tabelas | Realtime original ou SSE de alterações pela API local |
| persistResolvedGameReferences | Backfill de referências antigas via saveData | Continua passando pelo provider; em modo local só escreve no MySQL |
| idbCache/saveTableSnapshotToCache | Snapshot IndexedDB | Chave separada por provider, destino e origem; não mistura dados remotos e locais |

Não há chamadas `.rpc()`, Supabase Storage, Edge Functions ou consultas SQL enviadas pelo frontend. Não há `useEffect` no frontend ativo nem polling periódico de consultas. O heartbeat SSE local não consulta o banco. Temporadas, estatísticas, rankings e gráficos são calculados em JavaScript sobre o estado carregado.

## Objetos PostgreSQL conhecidos no repositório

- FK `jogos_adversarioId_fkey` e índice `jogos_adversario_id_idx`.
- Índice `jogadores_id_jogador_idx`.
- Função PL/pgSQL `set_id_jogador()` e trigger `jogadores_set_id_jogador`: equivalente MySQL para INSERT/UPDATE, sem remover o SQL original.
- Backfill SQL com `WITH`, `min() OVER (PARTITION BY ...)`, `UPDATE ... FROM` e `IS DISTINCT FROM`: não reexecutado na cópia; os valores existentes são copiados. A aplicação já tem resolução de referências antigas, mantida no provider.
- Políticas RLS e funções `auth.jwt()`: permanecem no Supabase. A API local não tenta reproduzir o catálogo Auth; usa uma sessão de administrador local com cookie HttpOnly/SameSite e validação no servidor.
- Publicação `supabase_realtime`: permanece intacta. Eventos locais vêm da API. Alterações diretas pelo Workbench aparecem após atualização de página ou atualização por foco, respeitando o intervalo de 60 segundos.
- Nenhuma view/procedure adicional consta nos arquivos; objetos instalados fora do repositório serão inventariados pela conexão real.

## Principais fontes potenciais de egress

1. **Carga completa das seis tabelas a cada abertura**, mesmo com IndexedDB. Paginação limita cada resposta, mas não o volume total. Foi mantida porque filtros, estatísticas e rankings dependem do histórico completo. Não é possível afirmar volume em bytes sem métricas do Supabase real.
2. **Fotos/escudos em Base64 dentro dos registros**, especialmente jogadores. `select('*')` transfere imagens junto de dados usados em estatísticas. Reduzir esse custo de modo significativo exige carregar imagens sob demanda ou usar URLs/Storage; isso não foi feito automaticamente, para não perder imagens nem mudar resultados.
3. **Recarga por foco sem paginação.** Além do tráfego repetido, a resposta podia ser truncada pelo limite REST e substituir o cadastro local por uma lista incompleta. Corrigida a paginação, incluída ordenação por ID e limitado o foco a uma recarga por minuto. A paginação correta pode aumentar o volume de uma recarga antes truncada; a redução da frequência não é garantia de redução total de egress.
4. **Comparação apenas de IDs no foco.** Edições de nome/foto/dados com o mesmo ID não eram reconhecidas. A comparação agora considera o conteúdo, invalida estatísticas e atualiza a página fora de formulários ativos.
5. **Dados de imagem temporários dentro de lineups.** `enrichJogos` inclui fotos para renderização. O fluxo existente remove fotos ao persistir referências; foi preservado. Não houve regravação em massa de jogos reais.
6. **Backfill automático de referências ao carregar.** Pode provocar escritas e eventos de atualização, mas segue restrito a registros sem referências resolvidas. No modo local, não chega ao Supabase.
7. **Busca de atletas:** as consultas específicas já projetavam colunas, limitavam 10/20 registros e tinham debounce/cache. Mantidas; invalidado o cache ao alterar jogadores para evitar respostas antigas.
8. **Cache global compartilhado entre destinos.** Corrigido o namespace por provider/banco/origem para evitar mostrar ou salvar dados do destino anterior.

Não foram removidas colunas das cargas completas nem transferidos cálculos para SQL sem conhecer o schema real e sem comparações de resultados. As grandes cargas iniciais continuam sendo um ponto a otimizar depois da contingência. Nenhuma estimativa de economia foi apresentada como medição real.

## Atenção manual

- Configurar a conexão PostgreSQL e a senha MySQL válida; validar o schema e as contagens reais.
- Revisar avisos de defaults, CHECKs, índices especiais e rotinas/triggers descobertos fora dos SQLs do projeto.
- Conflitos de sincronização exigem resolução por PK; o script não escolhe silenciosamente um lado.
- Exclusões locais não são enviadas ao Supabase.
- Contas Auth e arquivos Storage não são copiados. Não há uso de Storage no código; fotos existentes em colunas seguem com as linhas, URLs externas permanecem URLs.
- Manter a pasta `.local-data` e a tabela `_estatletico_baseline`; sem elas não há referência confiável para reconhecer conflitos.
- Conferir visualmente gráficos/layout e dados reais após a cópia. Os testes de DOM usam Chart/canvas simulados e não comprovam a renderização visual.
- Usar o site local durante a contingência; não apontar funções Netlify para localhost do seu computador.
