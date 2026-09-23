// TODO(zoom): faltan los datos de contacto reales de Zoom Publicidad.
// Estos valores se imprimen en TODOS los PDF (OP, OT, cotizaciones y OG).
// Los marcadores "PENDIENTE" son deliberados: se ven en QA y no dejan pasar
// a producción los datos de otra empresa.
export const COMPANY_INFO = {
  name: 'Zoom Publicidad',
  address: 'PENDIENTE: dirección',
  city: 'PENDIENTE: ciudad',
  phones: ['PENDIENTE: teléfono'],
  email: 'PENDIENTE: email',
} as const;

export const PDF_COLORS = {
  // Paleta Camaleón adaptada a papel blanco: el lima va en barras y rellenos,
  // nunca como texto (sobre blanco no se lee).
  headerBg: [22, 24, 22],          // gris carbón
  headerText: [255, 255, 255],
  tableHeaderBg: [29, 32, 28],     // gris carbón
  tableHeaderText: [255, 255, 255],
  tableRowEven: [255, 255, 255],
  tableRowOdd: [246, 248, 243],    // gris muy claro
  sectionTitleText: [74, 110, 12], // verde oscuro, legible sobre blanco
  borderGray: [224, 224, 224],
  totalRowBg: [240, 246, 230],     // lima muy claro
  bodyText: [40, 40, 40],
  footerText: [140, 140, 140],
  brandBar: [163, 211, 60],        // lima camaleón (barra del encabezado)
  linkText: [27, 127, 176],        // azul camaleón oscuro
} as const;

export const PDF_FONTS = {
  headerCompany: 16,
  headerDocTitle: 11,
  sectionTitle: 10,
  tableHeader: 8,
  tableBody: 8,
  label: 8,
  value: 9,
  totalLabel: 9,
  totalValue: 11,
  footer: 6.5,
} as const;

export const PDF_LAYOUT = {
  marginTop: 10,
  marginBottom: 22,
  marginLeft: 15,
  marginRight: 15,
  pageWidth: 210,
  pageHeight: 297,
  contentWidth: 180, // pageWidth - marginLeft - marginRight
  headerHeight: 38,
} as const;
