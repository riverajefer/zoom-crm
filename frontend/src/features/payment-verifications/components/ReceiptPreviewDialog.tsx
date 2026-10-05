import React from 'react';
import { Box, Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface Props {
  open: boolean;
  url: string;
  mimeType: string;
  onClose: () => void;
}

export const ReceiptPreviewDialog: React.FC<Props> = ({ open, url, mimeType, onClose }) => (
  <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogTitle>
      Comprobante de Pago
      <IconButton
        onClick={onClose}
        aria-label="Cerrar"
        sx={{ position: 'absolute', right: 8, top: 8, color: (theme) => theme.palette.grey[500] }}
      >
        <CloseIcon />
      </IconButton>
    </DialogTitle>
    <DialogContent>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: { xs: 250, sm: 400 },
          bgcolor: 'grey.100',
          borderRadius: 1,
          p: 2,
        }}
      >
        {mimeType.startsWith('image/') ? (
          <Box
            component="img"
            src={url}
            alt="Comprobante de pago"
            sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
          />
        ) : (
          <Box
            component="iframe"
            src={url}
            title="Comprobante de pago"
            sx={{ width: '100%', height: '70vh', border: 0 }}
          />
        )}
      </Box>
    </DialogContent>
  </Dialog>
);
