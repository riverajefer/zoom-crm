import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTheme, alpha } from '@mui/material/styles';
import Box from '@mui/material/Box';
import OrderFlowNode from './OrderFlowNode';
import ProductionOrderDetailsNode from './ProductionOrderDetailsNode';
import type { OrderFlowNodeData } from './OrderFlowNode';
import { getLayoutedElements } from '../utils/layout';
import type { OrderTreeResponse } from '../types/order-timeline.types';
import { useOrderProfitability } from '../../orders/hooks';

const nodeTypes = { 
  orderNode: OrderFlowNode, 
  productionDetails: ProductionOrderDetailsNode 
};

interface OrderFlowDiagramProps {
  data: OrderTreeResponse;
}

export default function OrderFlowDiagram({ data }: OrderFlowDiagramProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  // Detect the OP node to fetch profitability data
  const opNode = data.nodes.find((n) => n.type === 'OP');
  const { data: profitabilityData } = useOrderProfitability(opNode?.id ?? '');

  const { layoutedNodes, layoutedEdges } = useMemo(() => {
    const createdAtMap: Record<string, number> = Object.fromEntries(
      data.nodes.map((n) => [n.id, new Date(n.createdAt).getTime()]),
    );
    const childrenMap: Record<string, string[]> = {};
    data.edges.forEach((e) => {
      if (!childrenMap[e.source]) childrenMap[e.source] = [];
      childrenMap[e.source].push(e.target);
    });

    const nodes: Node[] = data.nodes.map((node) => {
      const children = childrenMap[node.id] ?? [];

      let endTime: number;
      if (node.endedAt) {
        // OT completada/cancelada: el reloj se detiene en su propio timestamp de cierre
        endTime = new Date(node.endedAt).getTime();
      } else if (node.type !== 'OT' && children.length > 0) {
        // COT y OP: el tiempo corre hasta que nació el primer documento hijo
        endTime = Math.min(...children.map((cId) => createdAtMap[cId]));
      } else {
        // OT activa, OG, o nodo sin hijos: tiempo en curso hasta ahora
        endTime = Date.now();
      }

      const durationMs = endTime - new Date(node.createdAt).getTime();
      const isOngoing = !node.endedAt && (node.type === 'OT' || children.length === 0);

      return {
        id: node.id,
        type: 'orderNode' as const,
        position: { x: 0, y: 0 },
        data: {
          ...node,
          isFocused: node.id === data.focusedId,
          durationMs,
          isOngoing,
        } as Record<string, unknown>,
      };
    });

    const edges: Edge[] = data.edges.map((edge) => ({
      id: `e-${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      animated: true,
      style: {
        stroke: isDark ? alpha('#2EA7E0', 0.5) : alpha('#3E4A38', 0.4),
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isDark ? '#2EA7E0' : '#3E4A38',
        width: 16,
        height: 16,
      },
    }));

    // Inject synthetic UTIL node if profitability data is available for an OP
    if (profitabilityData && opNode) {
      const utilityColor = profitabilityData.utility >= 0 ? '#10B981' : '#EF4444';
      const utilityNodeId = `utility-${opNode.id}`;

      // Prefer attaching from an OT node; fall back to the OP node itself
      const anchorNode =
        nodes.find((n) => (n.data as Record<string, unknown>)?.type === 'OT') ??
        nodes.find((n) => n.id === opNode.id);
      const anchorId = anchorNode?.id ?? opNode.id;

      const utilityLabel = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(Math.abs(profitabilityData.utility));

      nodes.push({
        id: utilityNodeId,
        type: 'orderNode' as const,
        position: { x: 0, y: 0 },
        data: {
          id: utilityNodeId,
          type: 'UTIL',
          number: `${profitabilityData.utilityPercentage.toFixed(1)}%`,
          status: '',
          clientName: profitabilityData.utility >= 0
            ? `Utilidad: ${utilityLabel}`
            : `Pérdida: ${utilityLabel}`,
          total: null,
          detailPath: '',
          createdAt: new Date().toISOString(),
          endedAt: null,
          isFocused: false,
          durationMs: 0,
          isOngoing: false,
          _utilityColor: utilityColor,
          _totalIncome: profitabilityData.orderTotal,
          _totalExpenses: profitabilityData.totalExpenses,
        } as Record<string, unknown>,
        selectable: false,
        draggable: true,
      });

      edges.push({
        id: `e-${anchorId}-${utilityNodeId}`,
        source: anchorId,
        target: utilityNodeId,
        type: 'smoothstep',
        animated: false,
        style: {
          stroke: utilityColor,
          strokeWidth: 2,
          strokeDasharray: '5,5',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: utilityColor,
          width: 14,
          height: 14,
        },
      });
    }

    // Production details nodes are positioned manually (not through dagre)
    const prodNodes: Node[] = [];
    const prodEdges: Edge[] = [];
    const otNodes = nodes.filter((n) => (n.data as Record<string, unknown>)?.type === 'OT');
    for (const otNode of otNodes) {
      const detailsNodeId = `prod-details-${otNode.id}`;

      prodNodes.push({
        id: detailsNodeId,
        type: 'productionDetails',
        position: { x: 0, y: 0 }, // will be set after dagre layout
        data: { workOrderId: otNode.id },
        selectable: false,
        draggable: true,
      });

      prodEdges.push({
        id: `e-${otNode.id}-${detailsNodeId}`,
        source: otNode.id,
        sourceHandle: 'bottom',
        target: detailsNodeId,
        targetHandle: null,
        type: 'smoothstep',
        animated: true,
        style: {
          stroke: isDark ? alpha('#F59E0B', 0.5) : alpha('#D97706', 0.4),
          strokeWidth: 2,
          strokeDasharray: '4,4',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isDark ? alpha('#F59E0B', 0.8) : alpha('#D97706', 0.8),
          width: 14,
          height: 14,
        },
      });
    }

    const { nodes: ln, edges: le } = getLayoutedElements(nodes, edges, 'LR');

    // Position production nodes below their OT parent
    for (const pn of prodNodes) {
      const parentOtId = (pn.data as Record<string, unknown>).workOrderId as string;
      const parentLayouted = ln.find((n) => n.id === parentOtId);
      if (parentLayouted) {
        pn.position = {
          x: parentLayouted.position.x - 20,
          y: parentLayouted.position.y + 300,
        };
      }
    }

    ln.push(...prodNodes);
    le.push(...prodEdges);

    return { layoutedNodes: ln, layoutedEdges: le };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isDark, profitabilityData]);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        '.react-flow__background': {
          backgroundColor: isDark
            ? theme.palette.background.default
            : '#FAFBFC',
        },
        '.react-flow__minimap': {
          backgroundColor: isDark
            ? alpha(theme.palette.background.paper, 0.9)
            : '#F1F5F9',
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`,
        },
        '.react-flow__controls': {
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`,
          overflow: 'hidden',
        },
        '.react-flow__controls-button': {
          backgroundColor: isDark
            ? theme.palette.background.paper
            : '#fff',
          borderBottom: `1px solid ${theme.palette.divider}`,
          color: theme.palette.text.primary,
          '&:hover': {
            backgroundColor: isDark
              ? alpha(theme.palette.primary.main, 0.1)
              : alpha(theme.palette.primary.main, 0.08),
          },
          '& svg': {
            fill: theme.palette.text.primary,
          },
        },
      }}
    >
      <ReactFlow
        nodes={layoutedNodes}
        edges={layoutedEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={isDark ? alpha('#2EA7E0', 0.15) : alpha('#3E4A38', 0.1)}
        />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node) => {
            const nodeData = node.data as unknown as OrderFlowNodeData;
            if (nodeData?.type === 'UTIL' && nodeData?._utilityColor) {
              return nodeData._utilityColor as string;
            }
            const typeColors: Record<string, string> = {
              COT: '#2EA7E0',
              OP: '#A3D33C',
              OT: '#F39200',
              OG: '#E8465A',
            };
            return typeColors[nodeData?.type] || '#9CA3AF';
          }}
          maskColor={isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.1)'}
          style={{ height: 100, width: 160 }}
        />
      </ReactFlow>
    </Box>
  );
}
