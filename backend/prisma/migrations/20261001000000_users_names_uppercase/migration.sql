-- Nombres de usuario en mayúscula sostenida, sin espacios de sobra.
--
-- Desde ahora `UsersService` guarda así nombre y apellido al crear y al editar
-- (`toPersonName`); esto lleva a ese formato los usuarios que ya existían.
-- En producción eran 27 de 36 (2026-10-01).
--
-- `upper()` respeta tildes y ñ porque la base usa LC_CTYPE en_US.utf8
-- («ñandú» → «ÑANDÚ»). `users` usa columnas camelCase, sin @map.
--
-- Migración idempotente: dev y staging comparten la misma base de datos.

UPDATE "users"
SET
  "firstName" = upper(btrim(regexp_replace("firstName", '\s+', ' ', 'g'))),
  "lastName"  = upper(btrim(regexp_replace("lastName",  '\s+', ' ', 'g')))
WHERE
  "firstName" IS DISTINCT FROM upper(btrim(regexp_replace("firstName", '\s+', ' ', 'g')))
  OR "lastName" IS DISTINCT FROM upper(btrim(regexp_replace("lastName", '\s+', ' ', 'g')));
