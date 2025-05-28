'use client';

import React, { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFontScale } from '@/hooks/useFontScale';
import { FontSizePreset } from '@/services/FontSizeService';

export function FontSizeSettings() {
  const { fontScale, setFontScale, setUseDeviceSettings } = useFontScale();
  const [useDeviceSettings, setLocalUseDeviceSettings] = useState(true);

  const handleFontScaleChange = (value: number[]) => {
    setFontScale(value[0]);
  };

  const handleUseDeviceSettingsChange = (checked: boolean) => {
    setLocalUseDeviceSettings(checked);
    setUseDeviceSettings(checked);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Font Size</CardTitle>
        <CardDescription>
          Adjust the text size for better readability
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Preview Section */}
        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg text-center space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400" style={{ fontSize: `${fontScale * 0.875}rem` }}>
            Preview Text
          </p>
          <p className="text-xl font-bold" style={{ fontSize: `${fontScale * 1.25}rem` }}>
            Dynasty
          </p>
        </div>

        {/* Font Size Slider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ fontSize: `${fontScale * 0.75}rem` }}>A</span>
            <Slider
              value={[fontScale]}
              onValueChange={handleFontScaleChange}
              min={0.85}
              max={1.5}
              step={0.05}
              className="mx-4 flex-1"
            />
            <span className="text-lg font-bold" style={{ fontSize: `${fontScale * 1.125}rem` }}>A</span>
          </div>
          
          {/* Size Presets */}
          <div className="flex justify-between text-xs text-gray-500">
            <button
              onClick={() => setFontScale(FontSizePreset.SMALL)}
              className={`px-2 py-1 rounded ${fontScale === FontSizePreset.SMALL ? 'bg-primary text-white' : 'hover:bg-gray-100'}`}
            >
              Small
            </button>
            <button
              onClick={() => setFontScale(FontSizePreset.MEDIUM)}
              className={`px-2 py-1 rounded ${fontScale === FontSizePreset.MEDIUM ? 'bg-primary text-white' : 'hover:bg-gray-100'}`}
            >
              Medium
            </button>
            <button
              onClick={() => setFontScale(FontSizePreset.LARGE)}
              className={`px-2 py-1 rounded ${fontScale === FontSizePreset.LARGE ? 'bg-primary text-white' : 'hover:bg-gray-100'}`}
            >
              Large
            </button>
            <button
              onClick={() => setFontScale(FontSizePreset.EXTRA_LARGE)}
              className={`px-2 py-1 rounded ${fontScale === FontSizePreset.EXTRA_LARGE ? 'bg-primary text-white' : 'hover:bg-gray-100'}`}
            >
              XL
            </button>
          </div>
        </div>

        {/* Use Device Settings Switch */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="device-settings" style={{ fontSize: `${fontScale}rem` }}>
              Use Browser Text Size
            </Label>
            <p className="text-sm text-gray-500" style={{ fontSize: `${fontScale * 0.875}rem` }}>
              Sync with your browser&apos;s font size settings
            </p>
          </div>
          <Switch
            id="device-settings"
            checked={useDeviceSettings}
            onCheckedChange={handleUseDeviceSettingsChange}
          />
        </div>
      </CardContent>
    </Card>
  );
}