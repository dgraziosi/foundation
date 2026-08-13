-- Soft-delete used to leave incident edges in place. Those rows were hidden by
-- get (listIncidentEdges) but still counted by child_of uniqueness and link
-- validation. Remove leftovers so the live graph and the unique index agree.
DELETE FROM edges
WHERE from_id IN (SELECT id FROM nodes WHERE deleted_at IS NOT NULL)
   OR to_id IN (SELECT id FROM nodes WHERE deleted_at IS NOT NULL);
