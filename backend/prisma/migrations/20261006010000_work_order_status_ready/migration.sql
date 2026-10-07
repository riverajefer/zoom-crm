-- Nuevo estado de OT: «Lista para entrega», entre producción y completada.
--
-- Idempotente: dev y staging comparten la misma base.
ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'READY' BEFORE 'COMPLETED';
