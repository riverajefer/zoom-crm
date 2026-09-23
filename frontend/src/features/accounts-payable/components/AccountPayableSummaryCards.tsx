import React from 'react';
import { Grid } from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { StatCard } from '../../../components/common/StatCard';
import { formatCurrency } from '../../../utils/formatters';
import { useAccountPayableSummary } from '../hooks/useAccountsPayable';
import type { FilterAccountPayableDto } from '../../../types/accounts-payable.types';
import { toDateFilter } from '../../../utils/dateFilters';

interface AccountPayableSummaryCardsProps {
  onFilterClick?: (filters: Partial<FilterAccountPayableDto>) => void;
}

export const AccountPayableSummaryCards: React.FC<AccountPayableSummaryCardsProps> = ({
  onFilterClick,
}) => {
  const { data: summary, isLoading } = useAccountPayableSummary();

  // Días del calendario local: `toISOString()` pasa a UTC y a partir de las
  // 7:00 p. m. hora Colombia ya devolvería el día siguiente.
  const today = toDateFilter(new Date());
  const in7days = toDateFilter(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  const cards: Array<{
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color: string;
    filterParams: Partial<FilterAccountPayableDto>;
  }> = [
    {
      title: 'Total Pendiente',
      value: summary ? formatCurrency(summary.totalAmountPending) : '$0',
      icon: <AccountBalanceWalletIcon fontSize="small" />,
      color: '#F97316',
      filterParams: { status: 'PENDING' as any },
    },
    {
      title: 'Total Vencido',
      value: summary ? formatCurrency(summary.totalAmountOverdue) : '$0',
      icon: <WarningAmberIcon fontSize="small" />,
      color: '#E8465A',
      filterParams: { status: 'OVERDUE' as any },
    },
    {
      title: 'Próx. a Vencer (7 días)',
      value: summary ? `${summary.upcomingCount} cuenta(s)` : '0',
      icon: <ScheduleIcon fontSize="small" />,
      color: '#F97316',
      filterParams: { dueDateFrom: today, dueDateTo: in7days },
    },
    {
      title: 'Cuentas Pagadas',
      value: summary ? `${summary.totalPaid} cuenta(s)` : '0',
      icon: <CheckCircleOutlineIcon fontSize="small" />,
      color: '#34C38F',
      filterParams: { status: 'PAID' as any },
    },
  ];

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {cards.map((card) => (
        <Grid item xs={12} sm={6} md={3} key={card.title}>
          <StatCard
            title={card.title}
            value={card.value}
            icon={card.icon}
            color={card.color}
            loading={isLoading}
            onClick={onFilterClick ? () => onFilterClick(card.filterParams) : undefined}
          />
        </Grid>
      ))}
    </Grid>
  );
};
