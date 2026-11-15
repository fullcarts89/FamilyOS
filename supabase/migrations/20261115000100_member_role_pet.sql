-- Family Rhythm (plan "Data additions": Members): pets are household members without accounts,
-- like children. Children and pets are the "cared for" members.
--
-- A new enum value can't be used in the transaction that adds it, so this stands alone; the
-- constraints and columns that use it follow in the next migration.

alter type app.member_role add value if not exists 'pet';
