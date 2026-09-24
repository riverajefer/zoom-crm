import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Tooltip,
  Divider,
  Button,
  Stack,
  alpha,
  useTheme,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  Circle as CircleIcon,
  CheckCircle as CheckCircleIcon,
  Delete as DeleteIcon,
  DoneAll as DoneAllIcon,
  ArrowForwardIos as ArrowForwardIosIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { PageHeader } from '../../../components/common/PageHeader';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { useNotifications } from '../../../hooks/useNotifications';
import {
  isNotificationNavigable,
  useNotificationNavigation,
} from '../../../hooks/useNotificationNavigation';
import { Notification } from '../../../types/edit-request.types';

export const NotificationsPage: React.FC = () => {
  const openNotification = useNotificationNavigation();
  const theme = useTheme();
  const {
    notificationsQuery,
    markAsReadMutation,
    markAllAsReadMutation,
    deleteMutation,
  } = useNotifications();

  const notifications = notificationsQuery.data?.data || [];
  const isLoading = notificationsQuery.isLoading;

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
    await openNotification(notification);
  };

  const handleMarkAsRead = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    markAsReadMutation.mutate(id);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteMutation.mutate(id);
  };

  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate();
  };

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Notificaciones"
        subtitle="Mantente al día con las actualizaciones del sistema"
        action={
          notifications.length > 0 && (
            <Button
              variant="outlined"
              startIcon={<DoneAllIcon />}
              onClick={handleMarkAllAsRead}
              disabled={markAllAsReadMutation.isPending}
            >
              Marcar todas como leídas
            </Button>
          )
        }
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <Card sx={{ mt: 3, borderRadius: 3 }}>
          <CardContent sx={{ p: 0 }}>
            {notifications.length === 0 ? (
              <Box sx={{ py: 10, textAlign: 'center' }}>
                <NotificationsIcon
                  sx={{ fontSize: 60, color: 'text.disabled', mb: 2, opacity: 0.5 }}
                />
                <Typography variant="h6" color="text.secondary">
                  No tienes notificaciones
                </Typography>
                <Typography variant="body2" color="text.disabled">
                  Te avisaremos cuando suceda algo importante.
                </Typography>
              </Box>
            ) : (
              <List sx={{ p: 0 }}>
                {notifications.map((notification, index) => (
                  <React.Fragment key={notification.id}>
                    <ListItem
                      disablePadding
                      sx={{
                        transition: 'all 0.2s',
                        backgroundColor: notification.isRead
                          ? 'transparent'
                          : alpha(theme.palette.primary.main, 0.04),
                        '&:hover': {
                          backgroundColor: alpha(
                            theme.palette.primary.main,
                            notification.isRead ? 0.02 : 0.08
                          ),
                          cursor: 'pointer',
                        },
                      }}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          width: '100%',
                          p: 2,
                          gap: 2,
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 40, justifyContent: 'center' }}>
                          {!notification.isRead ? (
                            <CircleIcon sx={{ fontSize: 12, color: 'primary.main' }} />
                          ) : (
                            <NotificationsIcon sx={{ color: 'text.disabled', opacity: 0.5 }} />
                          )}
                        </ListItemIcon>

                        <ListItemText
                          primary={
                            <Typography
                              variant="subtitle1"
                              sx={{
                                fontWeight: notification.isRead ? 500 : 700,
                                color: notification.isRead ? 'text.primary' : 'primary.main',
                              }}
                            >
                              {notification.title}
                            </Typography>
                          }
                          secondary={
                            <Stack spacing={0.5}>
                              <Typography variant="body2" color="text.secondary">
                                {notification.message}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {format(
                                  new Date(notification.createdAt),
                                  "dd 'de' MMMM, yyyy 'a las' HH:mm",
                                  { locale: es }
                                )}
                              </Typography>
                            </Stack>
                          }
                        />

                        <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
                          {!notification.isRead && (
                            <Tooltip title="Marcar como leída">
                              <IconButton
                                size="small"
                                onClick={(e) => handleMarkAsRead(e, notification.id)}
                                disabled={markAsReadMutation.isPending}
                              >
                                <CheckCircleIcon fontSize="small" color="primary" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Eliminar">
                            <IconButton
                              size="small"
                              onClick={(e) => handleDelete(e, notification.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <DeleteIcon fontSize="small" color="error" />
                            </IconButton>
                          </Tooltip>
                          {isNotificationNavigable(notification.relatedId, notification.relatedType) && (
                            <ArrowForwardIosIcon
                              sx={{
                                fontSize: '1rem',
                                color: 'text.disabled',
                                alignSelf: 'center',
                                ml: 1,
                              }}
                            />
                          )}
                        </Stack>
                      </Box>
                    </ListItem>
                    {index < notifications.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default NotificationsPage;
