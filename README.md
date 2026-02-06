# CMYK Halftone Generator

A retro CMYK halftone printing effect generator based on WebGL.

## Features

- **Real-time Preview**: Adjust parameters and see results instantly.
- **4 Presets**: Default, Drops, Newspaper, Vintage.
- **Customizable**: Control dots, angles, colors, and more.
- **Privacy First**: All processing happens locally in your browser.

## Tech Stack

- **Core**: Vanilla JavaScript + WebGL
- **Styling**: CSS Variables (Light Theme)
- **Deployment**: Vercel / Netlify

## Local Development

Since this project uses ES Modules (`type="module"`), you cannot open `index.html` directly in the browser due to CORS restrictions. You must use a local web server.

### Using Python
```bash
# Python 3
python3 -m http.server

# Python 2
python -m SimpleHTTPServer
```

### Using Node.js (npx)
```bash
npx serve .
```

Then open `http://localhost:8000` (or the port shown in your terminal).

## Credits

Based on the technical principles from [Paper.design](https://paper.design/blog/retro-print-cmyk-halftone-shader).

## License

MIT
