-- Allow clients to be created with only company name; other fields default to empty string.

ALTER TABLE clients
  ALTER COLUMN contact_person SET DEFAULT '',
  ALTER COLUMN email SET DEFAULT '',
  ALTER COLUMN phone SET DEFAULT '';
