# Estatlético — contingência MySQL local

## Sincronização Supabase com egress reduzido

O rollout incremental foi aplicado no Supabase em 19/09/2026 com `supabase_egress_incremental_sync.sql`. A carga principal agora usa somente colunas necessárias aos cálculos; fotos e escudos ficam fora dela e são buscados uma vez, somente quando a interface os exibe. O cache do navegador conserva tabelas e cursor por até 30 dias.

Cada INSERT, UPDATE ou DELETE nas seis tabelas cria uma revisão compacta no diário `estatletico_change_log`, retido por **35 dias**, e envia um Broadcast privado no tópico `estatletico:sync`. O navegador reconcilia o diário no Broadcast, na reconexão e ao voltar ao foco — sem recarregar tabelas inteiras nem a página. Uma mudança de imagem invalida seu cache e só baixa a nova imagem quando for necessária.

Para conferir o rollout, execute o SQL uma vez com uma conexão administrativa e valide: RLS ativo no diário, uma política SELECT para `authenticated`, seis triggers `estatletico_capture_change` e nenhum EXECUTE público na função. No painel Supabase, acompanhe **Usage → Egress** antes/depois; a referência anterior era cerca de 38,5 MB de mídia crua a cada carga completa. Não há percentual prometido antes das métricas do painel.

**Rollback:** publique primeiro uma versão do cliente anterior que ainda use Postgres Changes; somente depois remova as triggers de `estatletico_capture_change`, a política Broadcast e o diário. Não remova o diário enquanto uma versão incremental do cliente puder estar conectada. Para apenas desativar a otimização de forma reversível, mantenha os objetos e troque o build publicado.

O site continua em HTML/CSS/JavaScript. O backend novo é Node.js, na mesma linguagem do projeto. Todos os arquivos estão completos no repositório; não é necessário colar trechos manualmente.

**Estado histórico da contingência MySQL:** os testes iniciais usaram uma instância MySQL separada, porta 3317, com dados sintéticos. Desde então, a conexão PostgreSQL foi configurada e o rollout incremental descrito acima foi aplicado e validado no Supabase; esta nota não descreve o estado atual do Supabase.

## Arquitetura e troca de banco

```text
DATA_SOURCE=mysql
Navegador → API Node em 127.0.0.1:8000 → MySQL local

DATA_SOURCE=supabase
Navegador → cliente Supabase original → Auth / REST / Realtime
```

`server/config.cjs` lê `.env`. `data-provider.js` fornece à aplicação a interface de consultas que ela já utiliza. A variável histórica `supabaseClient` permanece em `app.js`, mas recebe o provider selecionado. Nenhum cliente Supabase é criado no modo MySQL; autenticação, consultas e eventos são locais.

`npm start` serve o frontend e gera `/runtime-config.js` dinamicamente. `npm run build` gera `dist/` com a configuração pública. Abrir o `index.html` diretamente, sem servidor/build, falha de propósito para evitar conexão acidental ao Supabase. A API não disponibiliza arquivos privados.

O banco é escolhido somente por `DATA_SOURCE`; reinicie o servidor ou refaça o build após a troca. As credenciais Supabase originais em `app.js` e os três arquivos SQL existentes foram preservados. As variáveis Supabase de `.env.example` são opcionais para o frontend original; `SUPABASE_DB_URL` é necessária para copiar/sincronizar o banco.

## Sequência exata para usar o banco local

1. **Criar o banco MySQL.** No Workbench, abra a conexão local que funciona e execute:

   ```sql
   CREATE DATABASE IF NOT EXISTS estatletico
     CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs;
   ```

   Se esse banco já tiver tabelas próprias, escolha outro nome, por exemplo `estatletico_contingencia`. A cópia recusa tabelas existentes sem seu manifesto; não sobrescreve um banco desconhecido.

2. **Configurar `.env`.** O arquivo local já foi criado e está ignorado pelo Git. Abra-o no editor e preserve os valores existentes:

   ```dotenv
   DATA_SOURCE=mysql
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   MYSQL_DATABASE=estatletico
   MYSQL_USER=root
   MYSQL_PASSWORD="senha da conexão que funciona no Workbench"
   PORT=8000
   PUBLIC_API_URL=
   LOCAL_ADMIN_PASSWORD="uma senha local com pelo menos 12 caracteres"
   SUPABASE_DB_URL="postgresql://usuario:senha-codificada@host:5432/postgres"
   MIGRATION_BATCH_SIZE=100
   ```

   Já existe uma senha local aleatória em `LOCAL_ADMIN_PASSWORD`; consulte-a no seu `.env` ou defina outra. Ela é independente da senha Supabase e da senha MySQL. Não publique esse arquivo. Use aspas em valores com `#`. Senhas na URL PostgreSQL precisam de codificação URL para caracteres especiais.

   Copie `SUPABASE_DB_URL` do botão **Connect** do painel Supabase: conexão direta ou **Session pooler**, porta 5432. O script exige TLS com validação de certificado. Se necessário, configure `SUPABASE_SSL_CA` com o caminho do certificado fornecido pelo Supabase. O script não desativa a validação TLS.

   O `.env` deste projeto tem prioridade sobre variáveis antigas do Windows, para garantir que a conexão validada no Workbench seja usada. Não remova suas variáveis Supabase.

3. **Instalar dependências**, em PowerShell na pasta do projeto:

   ```powershell
   npm ci
   ```

   Node.js 22 ou superior e MySQL 8 são necessários. Como alternativa à criação pelo Workbench, após configurar `.env`: `npm run db:create`.

4. **Inspecionar e copiar Supabase → MySQL**:

   ```powershell
   npm run db:inspect
   npm run db:copy
   ```

   A inspeção é somente leitura. A cópia também abre a origem em transação PostgreSQL **READ ONLY**; não altera schema, registros, Auth ou políticas do Supabase. Ela descobre todas as tabelas de `public`, exige as seis tabelas usadas pelo site, cria as correspondentes no MySQL e processa os dados em lotes. Se a restrição impedir a leitura PostgreSQL, será necessário aguardar a liberação ou obter um backup válido; não há como reconstruir todos os dados pela chave pública ou pelo cache do navegador.

5. **Conferir registros**:

   ```powershell
   npm run db:verify
   ```

   Confira origem na cópia, total local, iguais, alterados e novos. No Workbench, consulte também as seis tabelas. O manifesto e o relatório por tabela ficam em `.local-data/<identificador-do-destino>/schema.json`. A referência de comparação fica na tabela `_estatletico_baseline`. Preserve ambos em seus backups. Uma cópia interrompida pode ser repetida; registros locais diferentes são preservados e relatados como conflitos, nunca sobrescritos em massa.

6. **Iniciar o backend local**:

   ```powershell
   npm start
   ```

   O servidor só inicia no modo MySQL após uma cópia concluída e uma conexão válida com o MySQL.

7. **Configurar o frontend para a API local.** Deixe `PUBLIC_API_URL=` vazio: o frontend é servido pela própria API. Não é necessário iniciar outro servidor. `runtime-config.js` usa a configuração central automaticamente.

8. **Abrir e testar o site** em `http://127.0.0.1:8000`. Entre com `stefanobrunofaria@gmail.com` e sua `LOCAL_ADMIN_PASSWORD`. Confira dashboard, jogos, filtros, temporadas, elenco, jogadores, gráficos, tabelas, rankings, pesquisas e cadastros. Crie/edite um registro de conferência e consulte-o no Workbench. A conta local não usa nem altera a senha Supabase; criação de contas fica desabilitada nesse modo pessoal.

## Sequência exata para voltar ao Supabase

9. **Com o Supabase liberado**, encerre as edições pelo site/Workbench e simule:

   ```powershell
   npm run db:sync:dry-run
   ```

10. **Conferir diferenças e conflitos.** O terminal mostra novos, alterados, iguais, alterações somente no Supabase, conflitos e erros por tabela. Código de saída `2` indica conflitos/erros por registro. Resolva-os manualmente e repita a simulação antes da troca. O dry-run não escreve em nenhum dos bancos.

11. **Executar sincronização real**, explicitamente:

   ```powershell
   npm run db:sync
   ```

   No terminal interativo, digite `SINCRONIZAR` quando solicitado. Em automação não interativa, o comando exige `npm run db:sync -- --yes`. Não agende esse comando no servidor nem no Netlify. Depois, rode novamente `npm run db:sync:dry-run` para conferir o resultado.

12. **Alterar `.env` para `DATA_SOURCE=supabase`** e reiniciar `npm start` para conferir o modo Supabase localmente. Use novamente seu login Supabase original. O modo local e o remoto têm caches separados, inclusive por banco de destino.

13. **Fazer build e novo deploy**:

   ```powershell
   npm run build
   ```

   No Netlify, configure `DATA_SOURCE=supabase`, comando `npm run build` e publicação `dist`. O `netlify.toml` já contém esses padrões. Reimplante pelo fluxo que você já utiliza. Nenhum deploy foi executado nesta entrega. Não envie `.env`, `.local-data` ou senhas MySQL ao Netlify.

## Dados, conversões e conflitos

As tabelas conhecidas são `adversarios`, `estadios`, `competicoes`, `arbitros`, `jogadores` e `jogos`. Não existe tabela separada de temporadas no código: a temporada está nos registros de jogadores e jogos. Escalações/cartões/referências de atletas ficam dentro dos JSONs dos jogos. O script também descobre tabelas adicionais de `public`, preservando PKs compostas e ordenando a cópia pelas FKs.

Conversões implementadas: inteiros e bigint, booleanos, UUID, textos, enums, numeric com precisão/escala representáveis em MySQL, float/double, JSON/JSONB, arrays como JSON, bytea como BLOB, date/time e timestamp com microssegundos. Timestamps com fuso são normalizados para UTC. IDs explícitos são preservados; identities/sequences compatíveis viram AUTO_INCREMENT. A cópia verifica o hash do registro após a gravação e reverte o lote se detectar perda na conversão. O frontend mantém as limitações numéricas de JavaScript já existentes; a cópia/sincronização conserva valores exatos no banco quando representáveis.

Os índices B-tree simples/únicos compatíveis e as FKs são criados com as ações de referência da origem. Tipos sem conversão exata, numeric sem precisão definida, índices únicos especiais, colunas geradas, FKs cíclicas ou referências a outros schemas bloqueiam a cópia e indicam revisão manual. CHECKs, defaults PostgreSQL não convertíveis e índices especializados não únicos são relatados no manifesto. Views, materialized views, rotinas e triggers são inventariados; não existe tradução genérica de SQL PostgreSQL para MySQL.

O trigger conhecido `set_id_jogador` tem equivalente local para INSERT/UPDATE. Para inserções diretas de jogadores pelo Workbench, forneça um `id` explícito e estável, como já faz o site. Triggers e funções desconhecidos encontrados no banco precisam de revisão. Não são executados automaticamente os arquivos SQL antigos do projeto.

A sincronização compara o hash local e remoto com os hashes da última cópia/sincronização, usando a PK completa. Um registro local novo pode ser inserido. Uma edição local pode atualizar o remoto apenas se ele ainda corresponder à referência anterior. Alterações nos dois lados, colisões de ID sem referência e remoção remota de um registro editado são conflitos e são pulados. Alterações somente remotas são preservadas, sem substituir a referência local silenciosamente. Um trigger remoto que atualiza apenas `updated_at` é reconhecido; mudanças em outros dados pelo trigger provocam rollback daquele registro e aviso.

O envio usa UPSERT PostgreSQL por PK e nunca DELETE. Os scripts bloqueiam gravações concorrentes da API durante a operação; a sincronização real também bloqueia escritas nas tabelas PostgreSQL durante comparação/envio. Evite operações manuais concorrentes. Se houver identities, o ajuste das sequences usa bloqueio transacional e só avança o próximo valor quando necessário; exige permissão de proprietário da sequência. Nenhuma mudança é feita no schema das tabelas Supabase.

Exclusões feitas no site local continuam disponíveis, exigem PK na API e afetam somente o MySQL. **Não são propagadas ao Supabase**: ao voltar ao remoto, esses registros ainda existirão lá. Não há limpeza automática dos bancos. Use o Data Export do Workbench para guardar um backup de todas as tabelas locais, incluindo `_estatletico_baseline`, e copie também a pasta `.local-data` antes de qualquer intervenção manual destrutiva.

## Netlify e limites do modo local

Durante a contingência, use o site servido em `127.0.0.1:8000`. O Netlify não alcança o MySQL do seu computador por `localhost`. A API foi deliberadamente limitada ao loopback e à mesma origem; não está preparada para receber um frontend público Netlify por túnel/CORS. `PUBLIC_API_URL` existe para configuração do cliente, mas mudar apenas essa URL não habilita uma origem externa. Para este uso pessoal, mantenha-a vazia.

Chart.js, ícones, a biblioteca Supabase preservada e algumas imagens continuam vindo de CDNs externas. Modo MySQL significa dados/auth locais; não transforma o site em uma aplicação completamente offline.

## Verificação e arquivos

`npm test` executa os testes unitários, do provider e do fluxo de sincronização. Os testes de integração são opcionais e exigem um banco de teste separado; recusam porta 3306 e nomes fora de `estatletico_test_*`. Na implementação foram executados contra MySQL 8.0.40 isolado:

```powershell
$env:RUN_MYSQL_INTEGRATION='1'
$env:MYSQL_DATABASE='estatletico_test_20260906'
$env:MYSQL_PORT='3317'
$env:MYSQL_PASSWORD=''
npm test
```

Esses comandos são apenas para uma instância de teste correspondente, não para o banco principal. Os testes deixam dados sintéticos em seus bancos; não executam DROP/TRUNCATE para limpeza. A instância temporária utilizada durante esta entrega foi encerrada após os testes.

As verificações cobrem tipos, PK/FK, trigger, consultas/escritas da API, autenticação, isolamento de providers, bloqueio de arquivos privados, repetição da cópia e sincronização com conflitos. A origem PostgreSQL é simulada nos testes dos scripts: a conexão/schema e os triggers do Supabase real permanecem pendentes de verificação. A navegação foi testada em JSDOM contra a API/MySQL reais de teste, com Chart/canvas simulados. Não houve navegador conectado para revisão visual de gráficos/layout.

Arquivos centrais: `server/config.cjs`, `server/index.cjs`, `database/schema.cjs`, `database/records.cjs`, `database/repository.cjs`, `database/player-triggers.cjs`, `database/connections.cjs`, `data-provider.js`, `runtime-config.js`, `scripts/copy-supabase-to-mysql.cjs`, `scripts/sync-mysql-to-supabase.cjs`, `scripts/verify-mysql.cjs`, `scripts/create-mysql.cjs`, `scripts/build.cjs`, `.env.example`, `.gitignore`, `package.json`, `package-lock.json`, `netlify.toml` e os testes. `app.js` e `index.html` receberam a integração do provider. O relatório de consultas está em [docs/auditoria-dados.md](docs/auditoria-dados.md).

Referências consultadas: [conexões PostgreSQL do Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [MySQL2](https://sidorares.github.io/node-mysql2/docs) e [tipos no node-postgres](https://node-postgres.com/features/types).
# Configurações da conta

A última página do menu permite alterar nome, e-mail e senha no site Supabase. A troca de e-mail segue a confirmação do Supabase. Apenas `stefanobrunofaria@gmail.com` possui acesso administrativo; ao confirmar outro e-mail, a conta perde esse acesso.

A aba **Usuários** mostra nome, e-mail, cadastro e último login registrados no Supabase Auth. A consulta exige o e-mail administrativo confirmado no banco, independentemente da interface. Para instalar ou atualizar a função, execute `node scripts/deploy-account-settings.cjs` com `SUPABASE_DB_URL` configurado. O script valida o acesso administrativo e a rejeição de usuários comuns. O modo local MySQL mantém a conta única configurada pelo ambiente; edição de conta e listagem de usuários estão disponíveis no site Supabase.

Na aba Usuários, clicar em uma linha abre o relatório mensal de acessos por página. O mês usa o horário de Brasília. Cada entrada numa página conta uma visita; atualizações de dados e fotos na mesma página não contam novamente. O histórico começa na implantação, sem reconstruir acessos antigos. Execute `node scripts/deploy-page-visits.cjs` para instalar e verificar o banco. Os registros de teste são revertidos.

Para verificar o layout, `node scripts/check-mobile-layout.cjs` usa Chrome headless em 360, 390, 768 e 1440 pixels. Configure `PLAYWRIGHT_MODULE_PATH` com o caminho de `playwright-core` e, se necessário, `BROWSER_EXECUTABLE`. A verificação inspeciona as páginas estáticas; conteúdo extenso nas tabelas continua usando rolagem dentro do bloco.
