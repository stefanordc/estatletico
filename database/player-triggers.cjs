'use strict';
// Equivalente do set_id_jogador existente. Instala apenas triggers novos e
// identificados; nunca substitui triggers do usuário nem executa DROP.
async function installPlayerTriggers(db, manifest) {
  const t = manifest.tables.find(t => t.name === 'jogadores');
  if (!t || !['id', 'id_jogador', 'nome_completo', 'nascimento'].every(n => t.columns.some(c => c.column_name === n))) return;
  if (!manifest.triggers.some(t => t.event_object_table === 'jogadores' && /set_id_jogador/.test(t.action_statement))) return;
  for (const event of ['INSERT', 'UPDATE']) {
    const name = `_estatletico_player_${event.toLowerCase()}`;
    const [existing] = await db.query('SELECT TRIGGER_NAME FROM information_schema.triggers WHERE trigger_schema=DATABASE() AND trigger_name=?', [name]);
    if (existing.length) continue;
    const condition = event === 'UPDATE' ? 'IF NOT (NEW.nome_completo <=> OLD.nome_completo) OR NOT (NEW.nascimento <=> OLD.nascimento) THEN' : '';
    await db.query(`CREATE TRIGGER ${name} BEFORE ${event} ON jogadores FOR EACH ROW BEGIN
      DECLARE matched BIGINT DEFAULT NULL;
      ${condition}
      IF NEW.id IS NULL OR NEW.id=0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Informe um id explícito e estável para o jogador';
      END IF;
      IF NULLIF(TRIM(NEW.nome_completo),'') IS NOT NULL AND NEW.nascimento IS NOT NULL THEN
        SET matched=(SELECT id_jogador FROM jogadores WHERE nome_completo=NEW.nome_completo AND nascimento=NEW.nascimento AND id<>NEW.id AND id_jogador IS NOT NULL ORDER BY id LIMIT 1);
        SET NEW.id_jogador=matched;
      END IF;
      SET NEW.id_jogador=COALESCE(NEW.id_jogador,NEW.id);
      ${event === 'UPDATE' ? 'END IF;' : ''}
    END`);
  }
}
module.exports = { installPlayerTriggers };
