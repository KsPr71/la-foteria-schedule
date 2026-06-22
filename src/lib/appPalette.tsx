import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

export type AppPalette = {
  id: string;
  name: string;
  accent: string;
  accentSoft: string;
  ink: string;
  muted: string;
  line: string;
  paper: string;
  soft: string;
  green: string;
};

export const appPalettes: AppPalette[] = [
  {
    id: 'brick',
    name: 'Brick',
    accent: '#8f332a',
    accentSoft: '#f7ece9',
    ink: '#172033',
    muted: '#657084',
    line: '#e7dfda',
    paper: '#fffaf6',
    soft: '#f7ece9',
    green: '#2f7a53',
  },
  {
    id: 'blue',
    name: 'Azul',
    accent: '#111184',
    accentSoft: '#eceeff',
    ink: '#151b33',
    muted: '#626b86',
    line: '#dfe3f3',
    paper: '#fbfbff',
    soft: '#eef1ff',
    green: '#26735a',
  },
  {
    id: 'fuchsia',
    name: 'Fucsia',
    accent: '#c2185b',
    accentSoft: '#fde8f1',
    ink: '#2b1724',
    muted: '#7b6574',
    line: '#efd8e4',
    paper: '#fff9fc',
    soft: '#fdeaf3',
    green: '#2f7652',
  },
  {
    id: 'magenta',
    name: 'Magenta',
    accent: '#8e24aa',
    accentSoft: '#f4e7f8',
    ink: '#26172d',
    muted: '#75637b',
    line: '#e8d9ef',
    paper: '#fff9ff',
    soft: '#f5eafa',
    green: '#2b7559',
  },
  {
    id: 'red',
    name: 'Rojo',
    accent: '#b3261e',
    accentSoft: '#fde9e7',
    ink: '#2c1917',
    muted: '#7a6663',
    line: '#efd9d6',
    paper: '#fffaf9',
    soft: '#fdecea',
    green: '#2f7650',
  },
];

type AppPaletteContextValue = {
  palette: AppPalette;
  setPaletteId: (id: string) => void;
};

const AppPaletteContext = createContext<AppPaletteContextValue | null>(null);

export function AppPaletteProvider({ children }: PropsWithChildren) {
  const [paletteId, setPaletteId] = useState(appPalettes[0].id);
  const palette = useMemo(
    () => appPalettes.find((item) => item.id === paletteId) ?? appPalettes[0],
    [paletteId],
  );

  return (
    <AppPaletteContext.Provider value={{ palette, setPaletteId }}>
      {children}
    </AppPaletteContext.Provider>
  );
}

export function useAppPalette() {
  const context = useContext(AppPaletteContext);
  if (!context) {
    throw new Error('useAppPalette must be used inside AppPaletteProvider');
  }
  return context;
}
