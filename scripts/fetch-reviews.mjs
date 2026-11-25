// Fetches the Eluxen Carts Google rating and reviews and writes reviews.json for the home page.
// Run by .github/workflows/google-reviews.yml with the GOOGLE_PLACES_KEY repository secret.
// Usage: GOOGLE_PLACES_KEY=... node scripts/fetch-reviews.mjs
import { writeFileSync } from "node:fs";

const PLACE_ID = "ChIJyRgJ49cx5IgRuTjZU7htzvE";
const KEY = process.env.GOOGLE_PLACES_KEY;
if (!KEY) {
  console.error("GOOGLE_PLACES_KEY is not set; leaving reviews.json unchanged.");
  process.exit(1);
}

const res = await fetch(`https://places.googleapis.com/v1/places/${PLACE_ID}`, {
  headers: {
    "X-Goog-Api-Key": KEY,
    "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri,reviews",
  },
});
if (!res.ok) {
  console.error(`Places API returned ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const place = await res.json();

const reviews = (place.reviews || [])
  .filter((r) => r.text?.text || r.originalText?.text)
  .map((r) => ({
    author: r.authorAttribution?.displayName || "Google user",
    authorUrl: r.authorAttribution?.uri || "",
    photo: r.authorAttribution?.photoUri || "",
    rating: r.rating,
    text: (r.originalText?.text || r.text?.text).trim(),
    published: r.publishTime || "",
    when: r.relativePublishTimeDescription || "",
  }))
  .sort((a, b) => b.published.localeCompare(a.published));

const out = {
  rating: place.rating ?? null,
  count: place.userRatingCount ?? 0,
  url: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${PLACE_ID}`,
  reviewUrl: `https://search.google.com/local/writereview?placeid=${PLACE_ID}`,
  reviews,
};
writeFileSync(new URL("../reviews.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`Rating ${out.rating} from ${out.count} reviews; ${reviews.length} with text saved.`);
