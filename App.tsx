import React, { useEffect, useState } from 'react';

// Determine the initial theme based on the user's system preference.
// Falls back to light theme when the preference cannot be detected (e.g., during SSR).
const getInitialTheme = (): 'light' | 'dark' => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
};

interface StoredAppData {
  settings?: {
    theme?: 'light' | 'dark';
  };
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);

  // Simulated load from local storage
  const loadData = () => {
    const raw = localStorage.getItem('appData');
    if (raw) {
      const loadedData: StoredAppData = JSON.parse(raw);
      if (loadedData.settings) {
        setTheme(loadedData.settings.theme || getInitialTheme());
      }
    }
  };

  // Simulated import handler
  const importData = (imported: { data: StoredAppData }) => {
    if (imported.data.settings) {
      setTheme(imported.data.settings.theme || getInitialTheme());
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return <div data-theme={theme}>Hello world</div>;
}
