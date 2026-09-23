import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Menu,
  MenuItem,
  IconButton,
  Avatar,
  useTheme,
  useMediaQuery,
  Divider,
  ListItemIcon,
  alpha,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import BusinessIcon from '@mui/icons-material/Business';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { ROUTES } from '../../utils/constants';
import { formatFullName } from '../../utils/helpers';
import { NotificationBell } from './NotificationBell';
import { PendingApprovalsBell } from './PendingApprovalsBell';
import { AttendanceButton } from './AttendanceButton';
import { gradients, neonColors, neonAccents, darkSurfaces, darkModeColors } from '../../theme';
import { PERMISSIONS } from '../../utils/constants';

interface TopbarProps {
  onMenuClick?: () => void;
}

/**
 * Topbar con estilo Neón Elegante
 */
export const Topbar: React.FC<TopbarProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isDark = theme.palette.mode === 'dark';
  const { user, logout, hasPermission } = useAuthStore();
  const { setGlobalSearchOpen } = useUIStore();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleMenuClose();
    logout();
    navigate(ROUTES.LOGIN);
  };

  const handleProfile = () => {
    handleMenuClose();
    navigate(ROUTES.PROFILE);
  };

  const handleCompany = () => {
    handleMenuClose();
    navigate(ROUTES.COMPANY);
  };

  const userName = user ? formatFullName(user.firstName, user.lastName) : 'Usuario';
  const userInitials = user
    ? `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`.toUpperCase() ||
      (user.email ?? user.username ?? 'U').charAt(0).toUpperCase()
    : 'U';

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        background: isDark
          ? `linear-gradient(90deg, ${darkSurfaces.midnightBlue} 0%, ${darkSurfaces.cosmicPurple} 100%)`
          : `linear-gradient(90deg, #161816 0%, #1F221E 100%)`,
        borderBottom: isDark
          ? `1px solid ${darkModeColors.border}`
          : `1px solid ${alpha(neonColors.primary.main, 0.2)}`,
        boxShadow: isDark
          ? 'none'
          : '0 4px 20px rgba(0, 0, 0, 0.1)',
      }}
    >
      <Toolbar>
        {isMobile && (
          <IconButton
            color="inherit"
            aria-label="menu"
            onClick={onMenuClick}
            sx={{
              mr: 2,
              transition: 'all 0.3s ease',
              '&:hover': {
                backgroundColor: alpha(neonColors.primary.main, 0.2),
                transform: 'scale(1.05)',
              },
            }}
          >
            <MenuIcon />
          </IconButton>
        )}

        <Typography
          variant="h6"
          component="div"
          sx={{
            flexGrow: 1,
            fontWeight: 700,
            background: isDark
              ? gradients.neonPrimary
              : 'linear-gradient(90deg, #FFFFFF 0%, #C8E68A 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: isDark ? 'none' : 'none',
            filter: isDark
              ? 'none'
              : 'none',
          }}
        >
          Zoom Publicidad CRM
        </Typography>

        <Box display="flex" alignItems="center" gap={2}>

          {/* Global Search Button */}
          <Box
            onClick={() => setGlobalSearchOpen(true)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              cursor: 'pointer',
              px: { xs: 1.25, md: 1.75 },
              py: 0.85,
              borderRadius: '12px',
              background: isDark
                ? `linear-gradient(135deg, ${alpha(neonColors.primary.main, 0.12)} 0%, ${alpha(neonAccents.vividPurple, 0.1)} 100%)`
                : alpha(theme.palette.common.white, 0.15),
              border: `1px solid ${isDark ? darkModeColors.border : alpha(theme.palette.common.white, 0.35)}`,
              boxShadow: isDark ? 'none' : 'none',
              transition: 'all 0.25s ease',
              '&:hover': {
                background: isDark
                  ? `linear-gradient(135deg, ${alpha(neonColors.primary.main, 0.22)} 0%, ${alpha(neonAccents.vividPurple, 0.18)} 100%)`
                  : alpha(theme.palette.common.white, 0.25),
                borderColor: isDark ? neonColors.primary.main : alpha(theme.palette.common.white, 0.6),
                transform: 'translateY(-2px)',
                boxShadow: isDark
                  ? '0 2px 6px rgba(0, 0, 0, 0.35)'
                  : '0 4px 16px rgba(0,0,0,0.2)',
              },
            }}
          >
            <SearchIcon
              sx={{
                fontSize: 17,
                color: isDark ? neonColors.primary.main : alpha(theme.palette.common.white, 0.95),
                filter: isDark ? 'none' : 'none',
              }}
            />
            {!isMobile && (
              <>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 500,
                    fontSize: '0.82rem',
                    color: isDark ? alpha('#fff', 0.85) : alpha(theme.palette.common.white, 0.95),
                    letterSpacing: '0.01em',
                  }}
                >
                  Búsqueda general...
                </Typography>
                <Box
                  sx={{
                    px: 0.7,
                    py: 0.2,
                    borderRadius: '5px',
                    background: isDark ? alpha(neonAccents.vividPurple, 0.25) : alpha(theme.palette.common.white, 0.15),
                    border: `1px solid ${isDark ? darkModeColors.border : alpha(theme.palette.common.white, 0.3)}`,
                    ml: 0.5,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: '0.65rem',
                      fontFamily: 'monospace',
                      color: isDark ? alpha('#fff', 0.6) : alpha(theme.palette.common.white, 0.85),
                      lineHeight: 1,
                    }}
                  >
                    ⌘K
                  </Typography>
                </Box>
              </>
            )}
          </Box>

          {/* Attendance Button — visible solo para usuarios con permiso use_attendance */}
          {hasPermission(PERMISSIONS.USE_ATTENDANCE) && <AttendanceButton />}

          {/* Pending Approvals Bell */}
          <PendingApprovalsBell />

          {/* Notification Bell */}
          <NotificationBell />

          {/* User Menu Button */}
          <Box
            onClick={handleMenuOpen}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              cursor: 'pointer',
              py: 0.75,
              px: 1.5,
              borderRadius: '12px',
              transition: 'all 0.3s ease',
              background: isDark
                ? alpha(neonColors.primary.main, 0.1)
                : alpha(theme.palette.common.white, 0.1),
              border: `1px solid ${isDark
                ? alpha(neonAccents.vividPurple, 0.2)
                : alpha(theme.palette.common.white, 0.2)}`,
              '&:hover': {
                background: isDark
                  ? alpha(neonColors.primary.main, 0.2)
                  : alpha(theme.palette.common.white, 0.2),
                borderColor: isDark
                  ? alpha(neonColors.primary.main, 0.5)
                  : alpha(theme.palette.common.white, 0.4),
                transform: 'translateY(-2px)',
                boxShadow: isDark
                  ? '0 2px 6px rgba(0, 0, 0, 0.35)'
                  : '0 4px 15px rgba(0, 0, 0, 0.2)',
              },
            }}
          >
            <Avatar
              src={user?.profilePhoto || undefined}
              sx={{
                width: 36,
                height: 36,
                background: isDark
                  ? gradients.ocean
                  : gradients.neonPrimary,
                color: 'white',
                fontSize: '0.9rem',
                fontWeight: 600,
                boxShadow: isDark
                  ? 'none'
                  : '0 2px 8px rgba(0, 0, 0, 0.2)',
                border: `2px solid ${isDark
                  ? alpha(neonColors.primary.main, 0.5)
                  : alpha(theme.palette.common.white, 0.5)}`,
              }}
            >
              {userInitials}
            </Avatar>
            {!isMobile && (
              <Box sx={{ textAlign: 'left' }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    lineHeight: 1.2,
                    color: 'white',
                  }}
                >
                  {userName}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: isDark
                      ? neonColors.primary.light
                      : alpha(theme.palette.common.white, 0.8),
                    lineHeight: 1,
                  }}
                >
                  {user?.role?.name || 'Usuario'}
                </Typography>
              </Box>
            )}
            <KeyboardArrowDownIcon
              sx={{
                fontSize: 20,
                color: isDark
                  ? neonColors.primary.light
                  : alpha(theme.palette.common.white, 0.8),
                transition: 'transform 0.3s ease',
                transform: Boolean(anchorEl) ? 'rotate(180deg)' : 'rotate(0)',
              }}
            />
          </Box>
        </Box>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          BackdropProps={{
            sx: {
              backdropFilter: 'none', // Evita que la ventana quede en blur si hay un delay en el cierre
              backgroundColor: 'transparent', // Menos invasivo para un menú de topbar
            },
          }}
          PaperProps={{
            sx: {
              mt: 1.5,
              minWidth: 220,
              borderRadius: '16px',
              background: isDark
                ? `linear-gradient(135deg, ${alpha(darkSurfaces.midnightBlue, 0.95)} 0%, ${alpha(darkSurfaces.cosmicPurple, 0.9)} 100%)`
                : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
              backdropFilter: 'blur(16px)',
              border: isDark
                ? `1px solid ${darkModeColors.border}`
                : `1px solid ${alpha(neonColors.primary.main, 0.15)}`,
              boxShadow: isDark
                ? '0 2px 6px rgba(0, 0, 0, 0.35)'
                : '0 10px 40px rgba(0, 0, 0, 0.15)',
              overflow: 'hidden',
            },
          }}
        >
          {/* User Info Header */}
          <Box
            sx={{
              px: 2.5,
              py: 2,
              background: isDark
                ? `linear-gradient(135deg, ${alpha(neonColors.primary.main, 0.1)} 0%, ${alpha(neonAccents.vividPurple, 0.08)} 100%)`
                : `linear-gradient(135deg, ${alpha(neonColors.primary.main, 0.08)} 0%, ${alpha(neonAccents.vividPurple, 0.05)} 100%)`,
            }}
          >
            <Typography
              variant="subtitle2"
              fontWeight={600}
              sx={{
                color: isDark ? 'white' : 'text.primary',
              }}
            >
              {userName}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: isDark ? neonColors.primary.light : 'text.secondary',
              }}
            >
              {user?.email}
            </Typography>
          </Box>

          <Divider
            sx={{
              borderColor: isDark
                ? alpha(neonAccents.vividPurple, 0.2)
                : alpha(neonColors.primary.main, 0.1),
            }}
          />

          <MenuItem
            onClick={handleProfile}
            sx={{
              py: 1.5,
              mx: 1,
              my: 0.5,
              borderRadius: '10px',
              transition: 'all 0.3s ease',
              '&:hover': {
                background: isDark
                  ? alpha(neonColors.primary.main, 0.15)
                  : alpha(neonColors.primary.main, 0.08),
                transform: 'translateX(4px)',
              },
            }}
          >
            <ListItemIcon>
              <PersonIcon
                fontSize="small"
                sx={{
                  color: isDark ? neonColors.primary.main : neonColors.primary.dark,
                }}
              />
            </ListItemIcon>
            <Typography
              sx={{
                color: isDark ? 'white' : 'text.primary',
                fontWeight: 500,
              }}
            >
              Mi Perfil
            </Typography>
          </MenuItem>

          {hasPermission('read_company') && (
            <MenuItem
              onClick={handleCompany}
              sx={{
                py: 1.5,
                mx: 1,
                my: 0.5,
                borderRadius: '10px',
                transition: 'all 0.3s ease',
                '&:hover': {
                  background: isDark
                    ? alpha(neonColors.primary.main, 0.15)
                    : alpha(neonColors.primary.main, 0.08),
                  transform: 'translateX(4px)',
                },
              }}
            >
              <ListItemIcon>
                <BusinessIcon
                  fontSize="small"
                  sx={{
                    color: isDark ? neonColors.primary.main : neonColors.primary.dark,
                  }}
                />
              </ListItemIcon>
              <Typography
                sx={{
                  color: isDark ? 'white' : 'text.primary',
                  fontWeight: 500,
                }}
              >
                Información de Compañía
              </Typography>
            </MenuItem>
          )}

          <Divider
            sx={{
              borderColor: isDark
                ? alpha(neonAccents.vividPurple, 0.2)
                : alpha(neonColors.primary.main, 0.1),
            }}
          />

          <MenuItem
            onClick={handleLogout}
            sx={{
              py: 1.5,
              mx: 1,
              my: 0.5,
              borderRadius: '10px',
              transition: 'all 0.3s ease',
              '&:hover': {
                background: isDark
                  ? alpha(neonAccents.neonMagenta, 0.15)
                  : alpha(theme.palette.error.main, 0.08),
                transform: 'translateX(4px)',
              },
            }}
          >
            <ListItemIcon>
              <LogoutIcon
                fontSize="small"
                sx={{
                  color: isDark ? neonAccents.neonMagenta : theme.palette.error.main,
                }}
              />
            </ListItemIcon>
            <Typography
              sx={{
                color: isDark ? neonAccents.neonMagenta : theme.palette.error.main,
                fontWeight: 500,
              }}
            >
              Cerrar Sesión
            </Typography>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
};
