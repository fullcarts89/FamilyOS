import { Platform, Switch } from 'react-native';
import { color } from './tokens';

/** An on/off switch in the app's ink, with a white thumb on every platform. */
export function Toggle({
  value,
  onValueChange,
  label,
  disabled,
}: {
  value: boolean;
  onValueChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  // React Native Web colors the "on" thumb teal unless told otherwise.
  const web = Platform.OS === 'web' ? ({ activeThumbColor: color.surface } as object) : {};
  return (
    <Switch
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      accessibilityLabel={label}
      thumbColor={color.surface}
      trackColor={{ true: color.ink, false: color.line2 }}
      ios_backgroundColor={color.line2}
      {...web}
    />
  );
}
