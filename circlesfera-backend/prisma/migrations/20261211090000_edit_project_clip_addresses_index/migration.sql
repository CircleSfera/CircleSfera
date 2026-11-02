-- The addresses of the clips a studio draft keeps in its state, indexed, so
-- media access and the nightly sweep find the drafts naming a file without
-- reading every draft. The path is EDIT_CLIP_PATH (media-references
-- .service.ts), written out: a query uses the index only with the same
-- expression, and a spec checks the two never differ.
CREATE INDEX IF NOT EXISTS "edit_projects_clip_addresses_idx"
ON "edit_projects"
USING GIN (jsonb_path_query_array("state", 'strict $ ? (@.type() == "object" && exists(@.keyvalue() ? (@.key == "version" && @.value == 3))).keyvalue() ? (@.key == "studio").value ? (@.type() == "object").keyvalue() ? (@.key == "tracks").value ? (@.type() == "array")[*] ? (@.type() == "object").keyvalue() ? (@.key == "clips").value ? (@.type() == "array")[*] ? (@.type() == "object" && !exists(@.keyvalue() ? (@.key == "type" && @.value == "text"))).keyvalue() ? (@.key == "fileUrl").value ? (@.type() == "string" && !(@ like_regex "^[[:space:]]*(blob|data):" flag "i"))'::jsonpath));
