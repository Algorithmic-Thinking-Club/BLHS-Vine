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

// ui and brand tokens: teal, black and warm, with the world palette living in the art layer
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
