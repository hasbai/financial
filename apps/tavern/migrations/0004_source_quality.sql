-- Quarantine malformed public names. Private imports and conversations are retained.
DELETE FROM source_catalog WHERE source='theatrelm' AND (length(trim(name))=0 OR length(trim(name))>160);
UPDATE source_releases SET count=(SELECT count(*) FROM source_catalog c WHERE c.source=source_releases.source AND c.revision=source_releases.revision) WHERE source='theatrelm';
