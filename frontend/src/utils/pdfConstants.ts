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
  headerBg: [26, 31, 61],       // dark navy
  headerText: [255, 255, 255],
  tableHeaderBg: [26, 107, 122], // teal
  tableHeaderText: [255, 255, 255],
  tableRowEven: [255, 255, 255],
  tableRowOdd: [232, 244, 246],  // light teal
  sectionTitleText: [26, 107, 122],
  borderGray: [224, 224, 224],
  totalRowBg: [240, 247, 248],
  bodyText: [40, 40, 40],
  footerText: [140, 140, 140],
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
