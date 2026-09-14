-- merge(keep, drop) writes one activity row with action = merge.
ALTER TABLE activity DROP CONSTRAINT IF EXISTS activity_action_check;
ALTER TABLE activity ADD CONSTRAINT activity_action_check CHECK (action IN (
  'create', 'update', 'delete', 'restore',
  'link', 'unlink', 'type_change', 'relation_change', 'merge'
));
