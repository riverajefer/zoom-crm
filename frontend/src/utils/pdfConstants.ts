/**
 * Lo que es de toda la empresa y sale igual en todos los PDF. La dirección y
 * el teléfono no van aquí: son los de la sede del documento, que viven en
 * `Location` y llegan con cada documento (docs/PLAN_SEDES.md §9). Ver
 * `pdfContactLines`.
 */
export const COMPANY_INFO = {
  name: 'Zoom Publicidad',
  city: 'Bogotá',
  email: 'promocionaleszoom@gmail.com',
} as const;

/** La sede de un documento, en lo que le importa al PDF. */
export type PdfSede = { address?: string | null; phone?: string | null } | null | undefined;

/**
 * Las dos líneas de contacto de un PDF: la dirección de la sede del documento
 * con la ciudad, y su teléfono con el correo común. Una sede sin dirección ni
 * teléfono (la Matriz no es un local) o un PDF sin sede (la nómina es común)
 * imprime solo la ciudad y el correo.
 *
 * @param separator Entre el teléfono y el correo.
 */
export function pdfContactLines(sede: PdfSede, separator = ' | '): { address: string; contact: string } {
  return {
    address: sede?.address ? `${sede.address}, ${COMPANY_INFO.city}` : COMPANY_INFO.city,
    contact: [sede?.phone ? `Tel: ${sede.phone}` : null, COMPANY_INFO.email].filter(Boolean).join(separator),
  };
}

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
