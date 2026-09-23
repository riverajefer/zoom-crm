import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import TextField from '@mui/material/TextField';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import BuildIcon from '@mui/icons-material/Build';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import { alpha, useTheme } from '@mui/material/styles';
import { useOrderTimelineSearch } from '../hooks/useOrderTree';
import type { SearchResultItem } from '../types/order-timeline.types';

const TYPE_ICONS: Record<string, React.ElementType> = {
  COT: DescriptionIcon,
  OP: ShoppingCartIcon,
  OT: BuildIcon,
  OG: RequestQuoteIcon,
};

const TYPE_COLORS: Record<string, string> = {
  COT: '#2EA7E0',
  OP: '#A3D33C',
  OT: '#F39200',
  OG: '#E8465A',
};

const TYPE_LABELS: Record<string, string> = {
  COT: 'Cotizaciones',
  OP: 'Órdenes de Pedido',
  OT: 'Órdenes de Trabajo',
  OG: 'Órdenes de Gasto',
};

interface OrderSearchDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function OrderSearchDialog({
  open,
  onClose,
}: OrderSearchDialogProps) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const theme = useTheme();
  const { data, isLoading } = useOrderTimelineSearch(search);

  const allResults = useMemo(() => {
    if (!data) return [];
    return [
      ...data.quotes,
      ...data.orders,
      ...data.workOrders,
      ...data.expenseOrders,
    ];
  }, [data]);

  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResultItem[]> = {};
    for (const item of allResults) {
      if (!groups[item.type]) groups[item.type] = [];
      groups[item.type].push(item);
    }
    return groups;
  }, [allResults]);

  const handleSelect = (item: SearchResultItem) => {
    navigate(`/orders/flow/${item.entityType}/${item.id}`);
    onClose();
    setSearch('');
  };

  const handleClose = () => {
    onClose();
    setSearch('');
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: '70vh',
          bgcolor: theme.palette.background.paper,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1,
        }}
      >
        <Typography variant="h6" fontWeight={600}>
          Buscar Orden
        </Typography>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <TextField
          autoFocus
          fullWidth
          placeholder="Buscar por número de orden o nombre de cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: isLoading ? (
              <InputAdornment position="end">
                <CircularProgress size={20} />
              </InputAdornment>
            ) : null,
          }}
        />

        {search.length >= 2 && allResults.length === 0 && !isLoading && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary" variant="body2">
              No se encontraron resultados para "{search}"
            </Typography>
          </Box>
        )}

        {Object.entries(groupedResults).map(([type, items]) => (
          <Box key={type} sx={{ mb: 2 }}>
            <Typography
              variant="overline"
              sx={{
                color: TYPE_COLORS[type],
                fontWeight: 700,
                letterSpacing: 1,
                display: 'block',
                mb: 0.5,
              }}
            >
              {TYPE_LABELS[type] || type}
            </Typography>
            <List dense disablePadding>
              {items.map((item) => {
                const Icon = TYPE_ICONS[item.type] || ShoppingCartIcon;
                const color = TYPE_COLORS[item.type] || '#9CA3AF';
                return (
                  <ListItemButton
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    sx={{
                      borderRadius: 1,
                      mb: 0.5,
                      '&:hover': {
                        bgcolor: alpha(color, 0.08),
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Icon sx={{ fontSize: 20, color }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                          }}
                        >
                          <Typography
                            variant="body2"
                            fontWeight={600}
                          >
                            {item.number}
                          </Typography>
                          <Chip
                            label={item.type}
                            size="small"
                            sx={{
                              bgcolor: alpha(color, 0.15),
                              color,
                              height: 18,
                              fontSize: '0.65rem',
                              fontWeight: 700,
                            }}
                          />
                        </Box>
                      }
                      secondary={item.clientName}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}

        {search.length < 2 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary" variant="body2">
              Escribe al menos 2 caracteres para buscar
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
