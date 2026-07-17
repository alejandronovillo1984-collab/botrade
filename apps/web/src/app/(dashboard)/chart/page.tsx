export const dynamic = 'force-dynamic';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MarketChart } from '@/components/chart/MarketChart';

export default function ChartPage() {
  return (
    <DashboardLayout>
      <MarketChart />
    </DashboardLayout>
  );
}
