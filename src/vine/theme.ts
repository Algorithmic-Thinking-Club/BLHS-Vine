export interface ThemeTokens {
  colors: {
    ink: string
    surface: string
    raised: string
    text: string
    textDim: string
    accent: string
    accentWarm: string
    line: string
  }
  fonts: {
    display: string
    body: string
    mono: string
  }
}

// UI/brand tokens: teal + black + warm, the mascot brand. The world palette (greige siding,
// brick, greenery) lives in the art/tile layer, not here. See reference/palette-elements.md.
export const theme: ThemeTokens = {
  colors: {
    ink: '#141517',
    surface: '#1b1d21',
    raised: '#23262b',
    text: '#f4f1ea',
    textDim: '#9aa3a8',
    accent: '#15b3c3',
    accentWarm: '#e8b15a',
    line: '#2c3036',
  },
  fonts: {
    display: "'Fraunces', Georgia, serif",
    body: "'Hanken Grotesk', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
  },
}
