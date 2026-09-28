import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LoadingSpinner } from '../../../components/common/LoadingSpinner';
import { quotesApi } from '../../../api/quotes.api';
import { QuoteConsultaView } from '../components/QuoteConsultaView';
import { QuoteDetailPage } from './QuoteDetailPage';

/** Entrada de `/quotes/:id`: vista de consulta o página completa. Ver `OrderDetailRoute`. */
export const QuoteDetailRoute: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: quote, isLoading } = useQuery({
    queryKey: ['quote', id],
    queryFn: () => quotesApi.findOne(id!),
    enabled: !!id,
  });

  if (isLoading) return <LoadingSpinner />;
  if (quote?.accessMode === 'consulta') return <QuoteConsultaView quote={quote} />;
  return <QuoteDetailPage />;
};

export default QuoteDetailRoute;
