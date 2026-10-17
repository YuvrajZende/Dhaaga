# Place Provider & External Review Data Analysis

**Document Version:** 1.0  
**Context:** Happensten Circle-Trusted Place Search  
**Status:** Canonical Reference & Policy Compliance  

---

## 1. Executive Summary

Happensten's product thesis is:
> *"Search the world, then see what people you trust recommend."*

A critical architectural and legal question is whether external place providers (notably Google Maps / Google Places API) allow third parties to automatically query another user's personal review history and display it to friends in a proprietary social graph.

Following rigorous technical and terms-of-service verification, **Google does NOT provide an official API to passively query a private contact's Google Maps reviews and map them across social graphs**. 

Attempting to scrape public Google Maps profile pages or fabricate review associations violates Google's Developer Policies, copyright restrictions, and user privacy laws (GDPR/CCPA).

Instead, Happensten adopts a **legally sound, privacy-first, zero-knowledge-compatible architecture**:
1. **Place Discovery:** OpenStreetMap (OSM) and open geographical datasets provide place breadth with clear ODbL attribution.
2. **Trusted Network Endorsements:** Users explicitly record or import their own recommendations via Happensten, with granular circle-sharing controls (`share_with_circle`) and automatic private note protection (`is_private_note`).
3. **Data Provenance:** Every signal displays its authentic provenance (`source: "manual" | "google" | "happensten"`).

---

## 2. Detailed Technical & Legal Analysis of External Providers

### A. Google Places API & Google Maps Platform

| Criterion | Evaluation & Findings |
| :--- | :--- |
| **API Availability** | Google Places API provides place search (text search, nearby search), place details, and aggregated external star ratings (`rating`, `user_ratings_total`). |
| **User Review Scopes** | There is **no Google OAuth scope** (e.g. within Google Identity or Google People API) that grants access to a user's personal Google Maps reviews. |
| **Google Business Profile API** | Only permits verified merchants to read and reply to reviews left on their *own* managed business locations, not an individual's browsing or dining reviews. |
| **Google Takeout** | Users can export their *own* Google Maps reviews and saved places via Google Takeout as a local archive. An explicit user upload workflow is compliant because the user initiates and authorizes their own data. |
| **Caching & Storage Rules** | Google Places API Terms (Section 3.2.3) prohibit caching place details for more than 30 consecutive calendar days, except for `place_id`. Permanent storage of Google review text is prohibited. |
| **Third-Party Syndication** | Google Developer Policies prohibit scraping Google Maps profiles or aggregating Google review data into a competing third-party social review platform. |

**Conclusion on Google Reviews:**  
Passive extraction of friends' Google reviews cannot legally or technically be implemented via Google APIs. Any claim that a system can automatically monitor a friend's private Google account for new restaurant reviews without explicit user import is inaccurate and technically unviable without forbidden scraping.

---

### B. OpenStreetMap (OSM) / Overpass & Nominatim

| Criterion | Evaluation & Findings |
| :--- | :--- |
| **Licensing** | Open Database License (ODbL) 1.0. Allows commercial and private querying, search, and transformation. |
| **Attribution** | Requires credit to `© OpenStreetMap contributors`. |
| **Place Attributes** | Provides rich node/way metadata: `name`, `amenity` (restaurant, cafe, bar), `cuisine` (italian, pizza, etc.), `address`, `coordinates`, `opening_hours`. |
| **Storage & Caching** | Permitted without artificial 30-day eviction cycles. Ideal for caching stable geographical entities and coordinates locally. |
| **User Data Isolation** | Contains no personal user data; completely avoids cross-tenant or external review privacy entanglements. |

**Conclusion on OSM:**  
OpenStreetMap serves as a reliable, compliant, provider-agnostic place discovery baseline for Happensten.

---

## 3. Data Model & Sharing Semantics

Happensten decouples place existence from relationship intelligence:

```
[ External Provider / OSM ] ──► "What places exist?" (Entities)
                                         │
                                         ▼
[ Happensten Trust Graph ]   ──► "Who in my authorized network recommends this?"
                                         │
                                         ▼
                                   [ Recommendations ]
                                   • rating (1-5)
                                   • share_with_circle (boolean, default: false)
                                   • is_private_note (boolean, default: true)
                                   • source: "manual" | "google" | "happensten"
```

### Privacy Invariants Enforced in Code:

1. **Explicit Sharing Opt-in (`share_with_circle = true`):**  
   Saving a place or note is private by default. A recommendation only surfaces to friends if the owner explicitly turned ON circle sharing.
2. **Zero Note Leakage (`is_private_note = true`):**  
   Private notes are projected as `NULL` at the database query level whenever viewed by another user (`src/lib/places/repo.ts`). Private notes never enter server-side embeddings or external LLM prompts.
3. **Friendship Authorization:**  
   The viewer must have an `accepted` friendship status with the recommender and `sharing_enabled = true`. Client-supplied IDs are never trusted.
4. **Source Provenance:**  
   UI distinguishes whether a recommendation was authored directly on Happensten or imported from a user's verified archive (e.g. `Rated 5/5 by Sarah (on Happensten)` vs `(via Google)`).
