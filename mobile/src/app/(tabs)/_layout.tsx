import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useApp } from '../../ui/provider';
export default function Layout() {
  const { colors, t } = useApp();
  return (
    <NativeTabs tintColor={colors.accent}>
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Label>{t('home')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          md="home"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(projects)">
        <NativeTabs.Trigger.Label>{t('projects')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }}
          md="grid_view"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(usage)">
        <NativeTabs.Trigger.Label>{t('usage')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'chart.pie', selected: 'chart.pie.fill' }}
          md="pie_chart"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(settings)">
        <NativeTabs.Trigger.Label>{t('settings')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
          md="settings"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
