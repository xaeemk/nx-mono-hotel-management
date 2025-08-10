import { Box, Text } from '@chakra-ui/react';
import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import { RevenueData } from '../types';

export const RevenueChart = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data: revenueData } = useSWR<RevenueData[]>('/api/analytics/revenue');

  useEffect(() => {
    if (!revenueData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Simple line chart implementation
    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (revenueData.length === 0) return;

    // Find min/max values
    const maxRevenue = Math.max(...revenueData.map((d) => d.revenue));
    const minRevenue = Math.min(...revenueData.map((d) => d.revenue));

    // Draw axes
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;

    // Y-axis
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.stroke();

    // X-axis
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw revenue line
    ctx.strokeStyle = '#9333EA';
    ctx.lineWidth = 2;
    ctx.beginPath();

    revenueData.forEach((point, index) => {
      const x = padding + (index / (revenueData.length - 1)) * chartWidth;
      const y =
        padding +
        (1 - (point.revenue - minRevenue) / (maxRevenue - minRevenue)) *
          chartHeight;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw data points
    ctx.fillStyle = '#9333EA';
    revenueData.forEach((point, index) => {
      const x = padding + (index / (revenueData.length - 1)) * chartWidth;
      const y =
        padding +
        (1 - (point.revenue - minRevenue) / (maxRevenue - minRevenue)) *
          chartHeight;

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Labels
    ctx.fillStyle = '#4A5568';
    ctx.font = '12px Inter';
    ctx.textAlign = 'center';

    // X-axis labels (dates)
    revenueData.forEach((point, index) => {
      const x = padding + (index / (revenueData.length - 1)) * chartWidth;
      const label = new Date(point.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      ctx.fillText(label, x, height - padding + 20);
    });

    // Y-axis labels (revenue)
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const value = minRevenue + (maxRevenue - minRevenue) * (i / steps);
      const y = padding + (1 - i / steps) * chartHeight;
      ctx.textAlign = 'right';
      ctx.fillText(`$${value.toLocaleString()}`, padding - 10, y + 4);
    }
  }, [revenueData]);

  if (!revenueData) {
    return (
      <Box h="300px" display="flex" alignItems="center" justifyContent="center">
        <Text color="gray.500">Loading revenue data...</Text>
      </Box>
    );
  }

  return (
    <Box>
      <canvas
        ref={canvasRef}
        width={600}
        height={300}
        style={{ width: '100%', height: '300px' }}
      />
    </Box>
  );
};
