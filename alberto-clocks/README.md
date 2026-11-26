# Alberto Watch Company — Single-Page Website

A responsive single-page application (SPA) for Alberto Watch Company, a watch repair, appraisal and retail store. Built with **plain HTML5, CSS3 and JavaScript only** — no libraries, no frameworks, no build tools.

## How to run

**Option 1 — just open it.** Double-click `index.html`. Everything works offline from disk.

**Option 2 — local web server (recommended).** In this folder run:

```
npx serve .
```

Then open http://localhost:3000. Over a server the site reads the data store `data/products.json` directly. Geolocation also works more reliably on `http://localhost` than on `file://`.

## Project structure

```
alberto-clocks/
├── index.html            Page shell: header, all SPA sections, footer, ticker, popups
├── css/style.css         All styling, animations and responsive breakpoints
├── js/watch-render.js    Draws every watch/clock as SVG from the JSON "look" data
├── js/app.js             Router, rendering, popup, gallery, ticker, geolocation, forms
├── media/hero.mp4        Background video for the Home hero (muted, loops)
├── data/products.json    DATA STORE — company info, line-ups, products, stores, FAQ
└── data/products.js      Copy of the JSON for file:// use (keep in sync by hand)
```

## Requirement checklist

| # | Requirement | Where / how |
|---|---|---|
| 1 | Logo at top, decent colour scheme | SVG logo in header; black, ivory and brass palette |
| 2 | Menu: Products, Technology, Store Locator, Support … | Main nav. Products has a fading dropdown of line-ups |
| 3 | Sections on watch types, clocks and technology | Home, Products, Technology (each tech links to matching watches) |
| 4 | Categorised by product line-up | Vintage, Luxury, Smart Watches, Sport & Dive, Wall & Table Clocks |
| 5 | Selecting a line-up lists all its watches | `#/products/<lineup>` via tabs, dropdown or home cards |
| 6 | Watch details in a popup | Click any card or price row → modal with specs, features, enquiry |
| 7 | Price list for all watches | Price List page: search, filter by line-up, sort by price or name |
| 8 | Gallery | Masonry gallery with filters and a lightbox (← → keys, swipe, Esc) |
| 9 | Site map, Gallery, About Us, Contact Us links | Main nav and footer. Site Map page links every section and product |
| 10 | About/Contact show email, address, phone | Contact card on both pages (plus hours and service email) |
| ★ | Scrolling ticker with date, time and location | Fixed bottom ticker; HTML5 Geolocation, live clock (pauses on hover) |
| ★ | Visitor count top-right beside a logo image | Header badge with logo icon and animated count |
| ★ | Menu changes colour on hover and after clicking | Hover: brass text; clicked/active: brass pill plus pulse |
| ★ | Fade in/out for menus | Dropdown and mobile menu fade both ways; pages fade in |

Extras: store locator sorted by your distance (Haversine formula), repair-request and contact forms with validation, FAQ accordion, a live hero clock, keyboard accessibility (focus trap in popups, Esc to close), and reduced-motion support.

## Editing the data

All content lives in `data/products.json`. To add a watch, add an object to `products`:

```json
{ "id": "l7", "name": "…", "brand": "…", "lineup": "luxury", "price": 1234,
  "movement": "…", "caseSize": "…", "material": "…", "water": "…", "year": "…",
  "description": "…", "features": ["…"],
  "look": { "type": "round", "case": "#c0c4c8", "dial": "#111", "accent": "#eee", "markers": "index" } }
```

- `look.type` can be `round`, `square`, `pocket`, `smart`, `smartround`, `wall` or `table`.
- `look.markers` can be `index`, `roman` or `arabic`.
- Optional `look` fields: `bezel`, `strap` and `second` (colours).

After editing, make the same change in `data/products.js` so the offline copy stays in sync. Add an `"image"` field (an Unsplash photo URL) to show a real photo.

## Assumptions

1. **No server or database.** The spec allows JSON/TXT as the data store, so the visitor counter and form submissions are stored in the browser's `localStorage`. The counter shows `company.visitorBase` plus the visits counted in this browser (one per browser session). A shared, real counter would need a small back-end.
2. **Product images are real photos from Unsplash** (free to use under the Unsplash licence), set in each product's `image` field. If a photo cannot load (for example offline), the site falls back to an SVG drawing of the watch.
3. **Location in the ticker.** The browser asks for permission. If allowed, the ticker shows city and country (looked up from a free, key-less service when online) or the coordinates. If denied, it shows your time-zone city.
4. **Browsers.** Tested in Chrome. Written for current Edge, Chrome, Firefox and Safari. Internet Explorer is retired by Microsoft and is not supported.
5. **Prices and product details are sample data** for this student project. Brand and model names belong to their owners.
6. Web fonts (Cormorant Garamond and Jost) load from Google Fonts when online. Offline, the site falls back to system serif and sans-serif fonts.
