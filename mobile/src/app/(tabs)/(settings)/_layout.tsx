import { TabStack } from '../../../ui/components';
import { useApp } from '../../../ui/provider';
export default function Layout() {
  const { t } = useApp();
  return <TabStack name="settings" title={t('settings')} />;
}
