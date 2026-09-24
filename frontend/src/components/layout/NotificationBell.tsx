import React, { useState } from 'react';
import {
  IconButton,
  Badge,
  Menu,
  MenuItem,
  ListItemText,
  Typography,
  Divider,
  Box,
  Button,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  Circle as CircleIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNotifications } from '../../hooks/useNotifications';
import {
  isNotificationNavigable,
  useNotificationNavigation,
} from '../../hooks/useNotificationNavigation';
import { Notification } from '../../types/edit-request.types';
import { PATHS } from '../../router/paths';

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const openNotification = useNotificationNavigation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const { notificationsQuery, unreadCountQuery, markAsReadMutation } =
    useNotifications({ limit: 5 });

  const open = Boolean(anchorEl);
  const notifications = notificationsQuery.data?.data || [];
  const unreadCount = unreadCountQuery.data || 0;

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }

    if (isNotificationNavigable(notification.relatedId, notification.relatedType)) {
      handleClose();
      await openNotification(notification);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([
      notificationsQuery.refetch(),
      unreadCountQuery.refetch(),
    ]);
  };

  return (
    <>
      <IconButton color="inherit" onClick={handleClick}>
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: {
            width: 360,
            maxHeight: 480,
          },
        }}
      >
        <Box px={2} py={1} display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Notificaciones</Typography>
          <IconButton 
            size="small" 
            onClick={handleRefresh} 
            disabled={notificationsQuery.isFetching || unreadCountQuery.isFetching}
            sx={{ 
              animation: (notificationsQuery.isFetching || unreadCountQuery.isFetching) ? 'spin 1s linear infinite' : 'none',
              '@keyframes spin': {
                '0%': { transform: 'rotate(0deg)' },
                '100%': { transform: 'rotate(360deg)' }
              }
            }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Box>
        <Divider />

        {notifications.length === 0 ? (
          <Box px={2} py={3} textAlign="center">
            <Typography variant="body2" color="text.secondary">
              No tienes notificaciones
            </Typography>
          </Box>
        ) : (
          notifications.map((notification) => (
            <MenuItem
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              sx={{
                backgroundColor: notification.isRead
                  ? 'transparent'
                  : 'action.hover',
                whiteSpace: 'normal',
                py: 1.5,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                  width: '100%',
                }}
              >
                {!notification.isRead && (
                  <CircleIcon
                    sx={{ fontSize: 8, color: 'primary.main', mt: 1 }}
                  />
                )}
                <ListItemText
                  primary={notification.title}
                  secondary={
                    <>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 0.5 }}
                      >
                        {notification.message}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {format(
                          new Date(notification.createdAt),
                          "dd/MM/yyyy 'a las' HH:mm",
                          { locale: es },
                        )}
                      </Typography>
                    </>
                  }
                  primaryTypographyProps={{
                    variant: 'subtitle2',
                    fontWeight: notification.isRead ? 'normal' : 'bold',
                  }}
                />
              </Box>
            </MenuItem>
          ))
        )}

        {notifications.length > 0 && (
          <>
            <Divider />
            <Box px={2} py={1} textAlign="center">
              <Button
                size="small"
                onClick={() => {
                  navigate(PATHS.NOTIFICATIONS);
                  handleClose();
                }}
              >
                Ver todas
              </Button>
            </Box>
          </>
        )}
      </Menu>
    </>
  );
};
