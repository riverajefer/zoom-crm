import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import {
  AttachFile as AttachFileIcon,
  Close as CloseIcon,
  Image as ImageIcon,
  PictureAsPdf as PdfIcon,
  UploadFile as UploadFileIcon,
} from '@mui/icons-material';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { isAxiosError } from 'axios';
import { expenseOrdersApi } from '../../../api/expense-orders.api';
import { storageApi } from '../../../api/storage.api';
import { LoadingButton } from '../../../components/common/LoadingButton';
import { useSingleFlight } from '../../../hooks/useSingleFlight';
import { expenseOrdersKeys } from '../hooks';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

interface AttachItemReceiptDialogProps {
  open: boolean;
  onClose: () => void;
  expenseOrderId: string;
  item: { id: string; name: string; hasReceipt: boolean } | null;
}

/**
 * Sube o reemplaza el comprobante de pago de un ítem. Pensado para la OG que se
 * crea y se autoriza antes de tener el soporte: funciona en cualquier estado,
 * también pagada, sin pedir autorización de edición. No permite quitarlo.
 */
export const AttachItemReceiptDialog: React.FC<AttachItemReceiptDialogProps> = ({
  open,
  onClose,
  expenseOrderId,
  item,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    if (!open) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open]);

  const handleFileChange = (next: File | null) => {
    if (!next) return;
    if (!ALLOWED_TYPES.includes(next.type)) {
      enqueueSnackbar('Solo se permiten imágenes (JPG, PNG, GIF, WEBP) o PDF', { variant: 'warning' });
      return;
    }
    setFile(next);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const pasted = items[i].getAsFile();
        if (pasted) {
          const extension = pasted.type.split('/')[1] || 'png';
          handleFileChange(
            new File([pasted], `pasted-image-${Date.now()}.${extension}`, { type: pasted.type }),
          );
          e.preventDefault();
          break;
        }
      }
    }
  };

  const handleSave = useSingleFlight(async () => {
    if (!item || !file) return;
    setSaving(true);
    try {
      const uploaded = await storageApi.uploadFile(file, {
        entityType: 'expense_order',
        entityId: expenseOrderId,
      });
      await expenseOrdersApi.attachItemReceipt(expenseOrderId, item.id, uploaded.id);
      await queryClient.invalidateQueries({ queryKey: expenseOrdersKeys.detail(expenseOrderId) });
      enqueueSnackbar(
        item.hasReceipt ? 'Comprobante actualizado correctamente' : 'Comprobante adjuntado correctamente',
        { variant: 'success' },
      );
      onClose();
    } catch (error: unknown) {
      const message = isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined;
      enqueueSnackbar(message || 'Error al adjuntar el comprobante', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  });

  const isPdf = file?.type === 'application/pdf';

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <UploadFileIcon color="success" />
          <span>{item?.hasReceipt ? 'Actualizar comprobante de pago' : 'Adjuntar comprobante de pago'}</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {item && (
            <Typography variant="body2" color="text.secondary">
              Ítem: <strong>{item.name}</strong>
            </Typography>
          )}
          {item?.hasReceipt && (
            <Typography variant="body2" color="text.secondary">
              El archivo que subas reemplaza el comprobante actual.
            </Typography>
          )}
          <input
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            hidden
            ref={fileInputRef}
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          {!file ? (
            <Stack spacing={1}>
              <Button
                variant="outlined"
                startIcon={<AttachFileIcon />}
                size="small"
                onClick={() => fileInputRef.current?.click()}
                sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
              >
                Adjuntar imagen o PDF
              </Button>
              <Box
                onPaste={handlePaste}
                tabIndex={0}
                sx={{
                  border: '2px dashed',
                  borderColor: 'grey.300',
                  borderRadius: 1,
                  p: 2,
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, background-color 0.2s',
                  '&:hover, &:focus': {
                    borderColor: 'primary.main',
                    bgcolor: 'action.hover',
                  },
                }}
              >
                <ImageIcon sx={{ fontSize: 28, color: 'grey.400', mb: 0.5 }} />
                <Typography variant="caption" color="text.secondary" display="block">
                  O haz clic aquí y pega una imagen (Ctrl+V / ⌘+V)
                </Typography>
              </Box>
            </Stack>
          ) : (
            <Stack spacing={1.5}>
              {!isPdf && (
                <Box
                  sx={{
                    width: 'fit-content',
                    border: '1px solid',
                    borderColor: 'grey.300',
                    borderRadius: 1,
                    overflow: 'hidden',
                    bgcolor: 'grey.50',
                  }}
                >
                  <Box
                    component="img"
                    src={URL.createObjectURL(file)}
                    alt="Vista previa comprobante"
                    sx={{ display: 'block', maxWidth: 260, maxHeight: 180, objectFit: 'contain' }}
                    onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                  />
                </Box>
              )}
              <Stack direction="row" alignItems="center" spacing={1}>
                <Chip
                  icon={isPdf ? <PdfIcon /> : <ImageIcon />}
                  label={`${file.name} (${(file.size / 1024).toFixed(1)} KB)`}
                  color="primary"
                  variant="outlined"
                  size="small"
                  onDelete={
                    saving
                      ? undefined
                      : () => {
                          setFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }
                  }
                  deleteIcon={<CloseIcon />}
                  sx={{ maxWidth: 320 }}
                />
                <IconButton
                  size="small"
                  onClick={() => fileInputRef.current?.click()}
                  title="Cambiar archivo"
                  disabled={saving}
                >
                  <AttachFileIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <LoadingButton
          loading={saving}
          onClick={handleSave}
          variant="contained"
          color="success"
          disabled={!file}
          startIcon={<UploadFileIcon />}
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
};
