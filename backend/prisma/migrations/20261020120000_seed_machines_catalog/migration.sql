-- Solo Zoom: migración vaciada a propósito.
--
-- En High esta migración siembra el catálogo de máquinas que mandó su cliente
-- (17 máquinas de su planta). Zoom tiene otra planta, así que sus máquinas se
-- crean desde Organización → Máquinas. Se conserva el archivo con el mismo
-- nombre para que la historia de migraciones siga alineada con High (ver
-- DIVERGENCIA.md).
SELECT 1;
