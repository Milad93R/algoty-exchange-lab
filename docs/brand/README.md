# Shared AlgoTy identity

Milad prefers the original **a↗ algoty** logo, not the capital-A replacement. All placements use `apps/web/app/components/Brand.js` and `brand.css`: landing navigation/footer/terminal preview, product navigation, loading screen and account mark.

`apps/web/brand/geometry.mjs` contains the original local DM Sans Bold a↗ glyphs converted to vectors with the original oblique angle and tight spacing. This avoids font-dependent variations in the symbol. `restore-symbol.py` documents the conversion (requires fonttools). `BrandMark` draws its SVG path and `Sculpture` extrudes the same curves. Run `node apps/web/brand/generate.mjs` after geometry changes to update the favicon and SVG fallback.

Full coin rotation and initial front-facing reveal are retained. The brand-only service worker cache is v3; pages/APIs/trading data remain uncached. Wordmarks share typography and responsive sizing; color adapts for contrast and the coin's metallic/orange material.
