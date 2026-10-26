-- Aviso a Caja cuando una OG recibe la firma del admin.
--
-- Hasta ahora nadie le avisaba a Caja que una OG la esperaba: solo se
-- notificaba al solicitante. Caja pagaba entonces la CP espejo y después
-- alguien autorizaba la OG, y el gasto salía dos veces (OG-2026-0832).
ALTER TYPE "NotificationType" ADD VALUE 'EXPENSE_ORDER_PENDING_CAJA';
