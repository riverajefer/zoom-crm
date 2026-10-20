-- Catálogo inicial de máquinas y puestos de la planta, enviado por el cliente
-- (2026-10-20), con la ortografía corregida y en mayúscula sostenida.
--
-- Va como migración de datos para que llegue igual a staging y producción al
-- desplegar el temporizador. El área de producción queda vacía: se asigna desde
-- Organización → Máquinas, porque el catálogo de áreas tiene nombres distintos en
-- cada ambiente.
--
-- Idempotente: si ya existe una con el mismo nombre (sin importar mayúsculas),
-- no la duplica.

INSERT INTO "machines" ("id", "name", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid()::text, m.name, true, now(), now()
FROM (VALUES
  ('PLOTTER DTF UV'),
  ('PLOTTER ECOSOLVENTE'),
  ('PLOTTER SUBLIMACIÓN'),
  ('PLOTTER DTF TEXTIL'),
  ('IMPRESORA RÍGIDOS'),
  ('CORTADORA LÁSER'),
  ('LAMINADORA'),
  ('PLOTTER DE CORTE'),
  ('CALANDRA'),
  ('CORTE MANUAL EN MESA'),
  ('PLANCHA CINTAS PORTACARNET'),
  ('PLANCHA PARA TEXTILES'),
  ('MÁQUINA DE MUGS'),
  ('COSTURA'),
  ('FINALIZADOS'),
  ('PRODUCCIÓN EXTERNA'),
  ('PRODUCCIÓN INTERNA')
) AS m(name)
WHERE NOT EXISTS (
  SELECT 1 FROM "machines" x WHERE lower(x."name") = lower(m.name)
);
