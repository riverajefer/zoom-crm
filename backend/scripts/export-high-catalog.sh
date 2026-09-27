#!/bin/bash

# =============================================================================
# Exporta los catálogos de High a JSON para importarlos en Zoom
# =============================================================================
# Saca de la base de High (normalmente producción) los 11 catálogos que Zoom
# hereda: unidades de medida, áreas de producción, cargos, canales de venta,
# tipos y subcategorías de gasto, categorías de producto, productos,
# categorías de insumo, insumos y proveedores.
#
# Las credenciales de High NO viven en este repo: la URL se pasa en
# HIGH_DATABASE_URL. La sesión es de solo lectura a nivel de motor
# (default_transaction_read_only=on), igual que db-query.sh.
#
# Los archivos referencian a sus padres por NOMBRE, no por id: los UUID de
# High no significan nada en Zoom. Del insumo NO se exporta el stock actual
# (es inventario de High).
#
# Usage:
#   HIGH_DATABASE_URL='postgresql://...' ./scripts/export-high-catalog.sh
#   HIGH_DATABASE_URL='...' ./scripts/export-high-catalog.sh --out=/otra/carpeta
#
# Luego: npm run prisma:import:high   (ver prisma/import-high-catalog.ts)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
OUT_DIR="$BACKEND_DIR/prisma/data/high-catalog"

for arg in "$@"; do
  case $arg in
    --out=*) OUT_DIR="${arg#*=}" ;;
    --help|-h)
      sed -n '6,24p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Argumento desconocido: $arg  (usa --help para ver opciones)"
      exit 1
      ;;
  esac
done

if [[ -z "${HIGH_DATABASE_URL:-}" ]]; then
  echo "ERROR: falta HIGH_DATABASE_URL (la URL pública de la base de High)."
  echo "  HIGH_DATABASE_URL='postgresql://...' ./scripts/export-high-catalog.sh"
  exit 1
fi

if ! command -v psql &>/dev/null; then
  echo "ERROR: psql no encontrado."
  echo "  macOS:  brew install libpq && brew link --force libpq"
  exit 1
fi

mkdir -p "$OUT_DIR"

export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=60000"

# Una consulta por archivo: devuelve un único valor, el arreglo JSON completo.
export_json() {
  local file="$1" sql="$2"
  psql "$HIGH_DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 -c "$sql" > "$OUT_DIR/$file"
  local rows
  rows=$(grep -c '^    {' "$OUT_DIR/$file" || true)
  printf '  ✓ %-26s %5s registros\n' "$file" "$rows"
}

echo "→ Exportando catálogos de High en modo SOLO LECTURA a $OUT_DIR" >&2

export_json units-of-measure.json "
SELECT jsonb_pretty(coalesce(jsonb_agg(jsonb_build_object(
  'name', u.name, 'abbreviation', u.abbreviation,
  'description', u.description, 'isActive', u.is_active
) ORDER BY u.created_at, u.name), '[]'::jsonb))
FROM units_of_measure u"

export_json production-areas.json "
SELECT jsonb_pretty(coalesce(jsonb_agg(jsonb_build_object(
  'name', a.name, 'description', a.description, 'isActive', a.is_active
) ORDER BY a.created_at, a.name), '[]'::jsonb))
FROM production_areas a"

# cargos conserva las columnas en camelCase de su migración original.
export_json cargos.json "
SELECT jsonb_pretty(coalesce(jsonb_agg(jsonb_build_object(
  'name', c.name, 'description', c.description, 'isActive', c.\"isActive\",
  'productionAreaName', a.name
) ORDER BY a.name, c.\"createdAt\", c.name), '[]'::jsonb))
FROM cargos c
JOIN production_areas a ON a.id = c.\"productionAreaId\""

export_json commercial-channels.json "
SELECT jsonb_pretty(coalesce(jsonb_agg(jsonb_build_object(
  'name', ch.name, 'description', ch.description
) ORDER BY ch.created_at, ch.name), '[]'::jsonb))
FROM commercial_channels ch"

export_json expense-types.json "
SELECT jsonb_pretty(coalesce(jsonb_agg(jsonb_build_object(
  'name', t.name, 'description', t.description, 'isActive', t.is_active,
  'subcategories', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name', s.name, 'description', s.description, 'isActive', s.is_active
    ) ORDER BY s.created_at, s.name), '[]'::jsonb)
    FROM expense_subcategories s WHERE s.expense_type_id = t.id
  )
) ORDER BY t.created_at, t.name), '[]'::jsonb))
FROM expense_types t"

export_json product-categories.json "
SELECT jsonb_pretty(coalesce(jsonb_agg(jsonb_build_object(
  'name', pc.name, 'slug', pc.slug, 'description', pc.description,
  'icon', pc.icon, 'sortOrder', pc.sort_order, 'isActive', pc.is_active
) ORDER BY pc.sort_order, pc.created_at, pc.name), '[]'::jsonb))
FROM product_categories pc"

# Los Decimal salen como texto para no perder precisión en el camino.
export_json products.json "
SELECT jsonb_pretty(coalesce(jsonb_agg(jsonb_build_object(
  'name', p.name, 'slug', p.slug, 'description', p.description,
  'basePrice', p.base_price::text, 'priceUnit', p.price_unit,
  'isActive', p.is_active, 'categoryName', pc.name
) ORDER BY pc.name, p.created_at, p.name), '[]'::jsonb))
FROM products p
JOIN product_categories pc ON pc.id = p.category_id"

export_json supply-categories.json "
SELECT jsonb_pretty(coalesce(jsonb_agg(jsonb_build_object(
  'name', sc.name, 'slug', sc.slug, 'description', sc.description,
  'icon', sc.icon, 'sortOrder', sc.sort_order, 'isActive', sc.is_active
) ORDER BY sc.sort_order, sc.created_at, sc.name), '[]'::jsonb))
FROM supply_categories sc"

export_json supplies.json "
SELECT jsonb_pretty(coalesce(jsonb_agg(jsonb_build_object(
  'name', s.name, 'sku', s.sku, 'description', s.description,
  'categoryName', sc.name,
  'purchasePrice', s.purchase_price::text,
  'purchaseUnitName', pu.name, 'purchaseUnitAbbreviation', pu.abbreviation,
  'consumptionUnitName', cu.name, 'consumptionUnitAbbreviation', cu.abbreviation,
  'conversionFactor', s.conversion_factor::text,
  'minimumStock', s.minimum_stock::text,
  'isActive', s.is_active
) ORDER BY sc.name, s.created_at, s.name), '[]'::jsonb))
FROM supplies s
JOIN supply_categories sc ON sc.id = s.category_id
JOIN units_of_measure pu ON pu.id = s.purchase_unit_id
JOIN units_of_measure cu ON cu.id = s.consumption_unit_id"

export_json suppliers.json "
SELECT jsonb_pretty(coalesce(jsonb_agg(jsonb_build_object(
  'name', s.name, 'encargado', s.encargado, 'phone', s.phone,
  'landlinePhone', s.landline_phone, 'address', s.address, 'email', s.email,
  'personType', s.person_type, 'nit', s.nit, 'isActive', s.is_active,
  'departmentCode', d.code, 'departmentName', d.name, 'cityName', ci.name
) ORDER BY s.created_at, s.name), '[]'::jsonb))
FROM suppliers s
JOIN departments d ON d.id = s.department_id
JOIN cities ci ON ci.id = s.city_id"

echo "✓ Listo. Revisa con: npm run prisma:import:high   (simulación, no escribe)" >&2
