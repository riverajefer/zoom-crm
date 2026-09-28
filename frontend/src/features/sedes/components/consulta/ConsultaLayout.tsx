import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useSnackbar } from 'notistack';
import type { jsPDF } from 'jspdf';
import { DocumentTypeBanner } from '../../../../components/common/DocumentTypeBanner';
import { LoadingButton } from '../../../../components/common/LoadingButton';
import { ConsultaBanner, ConsultaDocumentType } from '../ConsultaBanner';
import { SedeChip } from '../SedeChip';
import type { SedeSummary } from '../../../../types';

interface ConsultaLayoutProps {
  type: ConsultaDocumentType;
  number: string;
  sede: SedeSummary;
  status: React.ReactNode;
  /** PDF del documento; en consulta se puede descargar (docs/PLAN_SEDES.md §8). */
  pdf?: { fileName: string; generate: () => Promise<jsPDF> };
  children: React.ReactNode;
}

/**
 * Esqueleto de las vistas de solo lectura de OP, COT y OT de otra sede: el
 * banner fijo del modo consulta, el encabezado del documento y las secciones.
 * Ninguna acción: se ocultan, no se deshabilitan, para que nadie intente algo
 * que no puede hacer. Ver docs/PLAN_SEDES.md §8.
 */
export const ConsultaLayout: React.FC<ConsultaLayoutProps> = ({ type, number, sede, status, pdf, children }) => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [generating, setGenerating] = useState(false);

  const downloadPdf = async () => {
    if (!pdf) return;
    setGenerating(true);
    try {
      const doc = await pdf.generate();
      doc.save(pdf.fileName);
    } catch {
      enqueueSnackbar('No se pudo generar el PDF', { variant: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Box>
      <ConsultaBanner type={type} sede={sede} />
      <DocumentTypeBanner type={type} documentNumber={number} />

      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
          Volver
        </Button>
        <Box sx={{ flex: 1 }} />
        <SedeChip sede={sede} />
        {status}
        {pdf && (
          <LoadingButton
            variant="outlined"
            size="small"
            startIcon={<PictureAsPdfIcon />}
            onClick={downloadPdf}
            loading={generating}
          >
            PDF
          </LoadingButton>
        )}
      </Stack>

      <Stack spacing={3}>{children}</Stack>
    </Box>
  );
};

/** Tarjeta con título para una sección de la vista de consulta. */
export const ConsultaSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Card>
    <CardContent>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {title}
      </Typography>
      {children}
    </CardContent>
  </Card>
);

/** Rejilla de datos (etiqueta y valor) del resumen. */
export const ConsultaFields: React.FC<{ fields: { label: string; value: React.ReactNode }[] }> = ({ fields }) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
      gap: 2.5,
    }}
  >
    {fields.map(({ label, value }) => (
      <Box key={label}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body1" component="div" sx={{ fontWeight: 500 }}>
          {value ?? '-'}
        </Typography>
      </Box>
    ))}
  </Box>
);

export interface ConsultaItemRow {
  id: string;
  description: string;
  quantity: number | string;
  unitPrice?: string;
  total?: string;
}

/** Tabla de ítems, con precios solo si el documento los tiene. */
export const ConsultaItemsTable: React.FC<{ items: ConsultaItemRow[] }> = ({ items }) => {
  const withPrices = items.some((i) => i.total !== undefined);
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Descripción</TableCell>
            <TableCell align="right">Cantidad</TableCell>
            {withPrices && <TableCell align="right">Valor unitario</TableCell>}
            {withPrices && <TableCell align="right">Total</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.description}</TableCell>
              <TableCell align="right">{item.quantity}</TableCell>
              {withPrices && <TableCell align="right">{item.unitPrice ?? '-'}</TableCell>}
              {withPrices && <TableCell align="right">{item.total ?? '-'}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
};

/** Enlaces a los documentos relacionados; se abren también en consulta si son de otra sede. */
export const ConsultaLinks: React.FC<{ links: { label: string; to: string; status?: React.ReactNode }[] }> = ({
  links,
}) => {
  const navigate = useNavigate();
  if (links.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Sin documentos relacionados.
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
      {links.map((link) => (
        <Stack key={link.to} direction="row" spacing={1} alignItems="center">
          <Button variant="text" onClick={() => navigate(link.to)} sx={{ fontWeight: 700 }}>
            {link.label}
          </Button>
          {link.status}
        </Stack>
      ))}
    </Stack>
  );
};
