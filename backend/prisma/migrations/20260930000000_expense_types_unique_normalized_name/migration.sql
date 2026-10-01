-- Un tipo de gasto por nombre, sin importar mayúsculas, tildes ni espacios.
--
-- El UNIQUE de `name` compara el texto exacto, así que dejaba convivir
-- «PRODUCCIÓN» y «PRODUCCION»: en producción el duplicado acumuló 140 OG y
-- 145 CP antes de fusionarse a mano el 2026-09-30
-- (`scripts/merge-duplicate-expense-type.ts`). En dev/staging el seed hacía lo
-- mismo: su `upsert` busca «Producción» literal y, si alguien había pasado el
-- tipo a mayúsculas, creaba otro.
--
-- El servicio valida antes de guardar, pero esa validación es un
-- check-then-act; el índice es la garantía real.
--
-- `normalize_catalog_name` replica `normName` (src/common/utils/normalize.util.ts):
-- minúsculas, sin tildes, todo lo que no sea letra o dígito colapsado a un
-- espacio. `normName` quita cualquier marca diacrítica vía NFD; aquí se listan
-- las del español y las vocales con diéresis o acento grave. Si algún día
-- difieren, el servicio es más estricto que el índice, nunca al revés.
--
-- Migración idempotente: dev y staging comparten la misma base de datos.

CREATE OR REPLACE FUNCTION normalize_catalog_name(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(
    lower(translate(
      value,
      'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç',
      'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc'
    )),
    '[^a-z0-9]+', ' ', 'g'
  ))
$$;

-- Fusionar duplicados mueve OG y CP de categoría: es una decisión de negocio
-- (cuál nombre se queda), así que la migración no la toma sola. Falla con la
-- lista y la instrucción. Al 2026-09-30 producción no tiene ninguno.
DO $$
DECLARE
  dupes text;
BEGIN
  SELECT string_agg(names, '; ') INTO dupes
  FROM (
    SELECT string_agg(format('«%s»', name), ', ' ORDER BY name) AS names
    FROM expense_types
    GROUP BY normalize_catalog_name(name)
    HAVING count(*) > 1
  ) g;

  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'Hay tipos de gasto duplicados: %. Fusiónalos con scripts/merge-duplicate-expense-type.ts y vuelve a aplicar la migración.',
      dupes;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "expense_types_name_normalized_unique"
  ON "expense_types" (normalize_catalog_name("name"));
