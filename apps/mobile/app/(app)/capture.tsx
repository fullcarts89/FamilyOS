import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { useCapture } from '../../lib/capture';

// Old link to the capture screen: capture is now a sheet over any screen. Open it over Today.
export default function CaptureLink() {
  const { open } = useCapture();
  useEffect(() => open(), [open]);
  return <Redirect href="/" />;
}
