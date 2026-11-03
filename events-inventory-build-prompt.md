# Build: Events Inventory Tracker (Nordic Group)

## Context

I work for Nordic Group, which runs several brands: Nordic Laboratories, Functional Future, Nordic Health, DNA Life and Simply Nature. We take event equipment and materials (stands, banners, displays, tablecloths, product samples, leaflets, merch) to events in different countries. These things are stored in a small storeroom in Copenhagen and in storage locations in other countries, and they are shipped between them in cardboard boxes, usually with DHL Express.

Right now we track this in a messy shared Google Sheet. I want a web app that a small internal team (a few people) can use, mostly from their phones, to always know what we have, where it is, and what is in which box. The key design goal is that **updating the system must be fast and happen at the moment something physically happens** (scan a box, tap a button). Nobody should have to do slow admin.

The app will be tested on Railway first, then my colleague Oliver will move it onto our internal server system (Nordic VMS). It must be fully self-contained and easy for him to deploy. Do not depend on managed third-party services (no Supabase, Firebase, Vercel-specific features, cloud storage buckets, etc.).

There is no existing data to import. We will enter everything manually, so data entry must be quick.

## How I want you to work

- Before writing code, read this whole document and give me a short plan: the stack you'll use, the data model, and the folder structure. Point out anything in this spec that seems wrong, contradictory or over-complicated, and ask me about anything unclear. Wait for my OK before building.
- Build in the phases listed below. At the end of each phase: stop, summarise what was built, tell me exactly how to test it (including on my phone), and wait for me before continuing.
- Use git and commit at sensible points, at least once per phase.
- Keep it simple and maintainable. Prefer boring, well-known libraries. Don't add features that aren't in this spec without asking.
- Write automated tests for the core stock logic (packing, unpacking, shipping, arriving, quantity changes, barcode normalisation), because mistakes there would silently corrupt the inventory.
- The UI language is English. Use European date format (DD/MM/YYYY).

## Tech requirements

- Suggested stack (propose alternatives only if you have a strong reason): **Next.js (App Router) + TypeScript**, **PostgreSQL** with **Prisma**, **Tailwind CSS**, **zod** for validation, **sharp** for image processing, a browser barcode scanning library that reads **both QR codes and Code 128** (e.g. @zxing/browser), and the `qrcode` package for generating QR labels.
- Packaged with **Docker**: a `Dockerfile` for the app and a `docker-compose.yml` that runs the app and Postgres together with persistent volumes for the database and photos. One command should start everything locally.
- **All configuration via environment variables**, documented in `.env.example`: database URL, app base URL, upload directory, session secret, auth provider, initial admin username/password, optional DHL API key, and the DHL tracking URL template.
- **Photos are stored on the server's disk** in a configurable upload directory (a mounted volume). They must be served only through an authenticated route, never as public static files.
- Database migrations must run automatically on app start in production.
- **Mobile-first.** Most use will be on phones (iOS Safari and Android Chrome) in storerooms and at event venues. Use large touch targets, a bottom navigation bar or similarly thumb-friendly navigation, and a prominent **Scan** button available everywhere. Desktop must also work well, especially for bulk entry and overviews.
- Phone camera access only works over HTTPS (or localhost). Give me a practical way to test camera and scanning features on my actual phone during development, for example an early Railway deploy or a tunnel.

## Core concepts and data model

### Companies

- An editable list managed by admins. Seed it with: Nordic Laboratories, Functional Future, Nordic Health, DNA Life, Simply Nature.
- Admins can add, rename and remove companies. If a company still has items tagged with it, removing it **archives** it (hidden from pickers, history kept). A company with nothing attached can be deleted outright.

### Locations

- Fields: name, country, type (**storage** or **event venue**), and an optional address/notes.
- Managed by admins. Seed one location: "Copenhagen storeroom" (Denmark, storage).
- No shelves or sub-areas. Locations are small.

### Items (catalogue entries)

- An item is a **type of thing**, e.g. "Functional Future roll-up banner" or "Nordic Labs tote bag". It is photographed once, regardless of how many copies exist or where they are.
- Fields: name, main photo (required in the normal flow, but allow saving without one), optional extra photos, description/notes, **one or more companies**, an optional low-stock threshold, and an archived flag.
- One-off items (e.g. a branded fridge) are simply items with quantity 1. Consumables are items with larger quantities. There is **one model for everything**. Do not split equipment and stock into separate systems.

### Holdings (where quantities of items actually are)

- A holding is a quantity of one item, located **either** inside a box **or** loose at a location. It must be exactly one of the two.
- A holding has an optional **best-before date**, because many of our products are food-based. The same item with different best-before dates is held as separate holdings.
- Quantities can never go negative. All quantity changes must happen inside database transactions.

### Boxes

- A box is a physical (usually cardboard) container. **Anything that travels is a box in the system**, even a single stand shipped on its own.
- Each box gets an auto-generated internal code from a global running number, e.g. `BOX-0047`. Numbers are **never reused**, even after a box is deleted.
- Fields: code, current location (empty while in transit), status (**at location** / **in transit**), origin and destination while in transit, optional description, optional photo.
- Boxes cannot be nested. The structure is: location → boxes → holdings, plus location → loose holdings.
- Cardboard boxes are mostly one-trip containers, so boxes must be easy to get rid of (see Unpacking and Deleting below).

### Barcodes linked to boxes

A box can have any number of linked barcodes. Scanning any of them opens the box. Barcode types:

1. **App QR label.** Printed from the app. The QR content should be a URL of the form `{APP_BASE_URL}/b/{BOX_CODE}`, so a normal phone camera also opens the box page. The in-app scanner must extract the box code from **any** such URL regardless of host, so labels printed during Railway testing keep working after we move servers.
2. **DHL Express piece ID.** This is the barcode printed as e.g. `(J) JD01 4600 0129 0160 4680`. It is unique to one box. The encoded barcode value usually has an extra leading `J` data identifier (e.g. `JJD014600012901604680`). Normalise by uppercasing, removing spaces and brackets, and stripping a leading `J` when the value starts with `JJD`, so the scanned and printed forms match. Piece IDs are unique per box.
3. **DHL waybill.** Printed as e.g. `WAYBILL 64 5655 6024` (10 digits). This is the shipment and tracking number. It can be **shared by several boxes** in the same shipment, so it is not unique.

DHL labels also have a routing barcode that looks like `(2L)DK1164+48000001` (it starts with `2L` and is built from the destination postcode). It is the same for every parcel to the same address. If this is scanned, reject it with a clear message: "That's DHL's routing barcode. Scan the bottom barcode (starting JD) instead."

A box that ships more than once collects multiple DHL barcodes. Keep all of them so old labels still resolve. Treat the newest waybill as the current one for tracking.

### Users and roles

- Two roles: **admin** (everything, including managing companies, locations and users, and deleting) and **member** (all day-to-day actions: add items, pack, unpack, ship, arrive, adjust quantities).
- Users are created automatically the first time they sign in, with the member role. Admins can promote, demote and deactivate users from a Users page.

### History log

- Every change is recorded in an append-only log: who, when, what action, which item/box/location, quantities, from/to, and an optional note.
- Actions to log include: item created/edited/archived, box created, packed, unpacked, shipped, arrived, discarded/deleted, barcode linked, and quantity adjusted (with reason).
- Deleted boxes are **soft-deleted**: hidden from all lists and searches, but history entries still show "50 tote bags arrived in Copenhagen in BOX-0012".
- Show history on item pages, box pages and location pages.

## Key flows

### Scan (available everywhere)

- Opens the camera and reads QR and Code 128.
- Resolves the scanned value:
  - app QR or DHL piece ID → open that box;
  - waybill → if one box, open it; if several, show the list to choose from;
  - routing barcode → show the rejection message above;
  - unknown barcode → offer "Link to an existing box" or "Create a new box with this barcode".
- There must also be a manual entry field for typing a box code, piece ID or waybill when the camera can't read a label.

### Adding items (must be fast)

- **Quick-add on phone.** The camera opens first for the photo, then name, companies, quantity, location, optional box and optional best-before date. A **"Save & add another"** button keeps the location, box and companies from the previous entry, so working through a storeroom only requires changing what differs.
- A **Duplicate** action on any item for near-identical items.
- **Bulk entry on desktop.** A spreadsheet-like grid for typing many rows quickly (name, companies, quantity, location, optional box, optional best-before). Photos can be added afterwards. Items without photos should be easy to find via a "Missing photo" filter.
- When adding stock of an item that already exists, offer to add the quantity to the existing item rather than creating a duplicate (search-as-you-type on the name).

### Packing a box (only at storage locations)

- Create a new box at a storage location, or choose an existing empty one.
- Add items from that location's loose stock with quantities. You cannot pack more than is available. Show available quantities and best-before dates.
- Optionally take a photo of the packed box.
- Then either link a barcode (scan a DHL label) or print an app QR label. Both can also be done later.

### Printing labels

- Generate a printable label for a box: QR code, box code in large text, current location, and companies of its contents. Size it for a sticker or A6, with an option for several labels on one A4 sheet.
- Printing is only needed for boxes that sit in storage before shipping. Boxes shipped straight away can use the DHL label.

### Shipping a box

- From the box page: "Ship", choose the destination location, and scan the DHL label to link the piece ID and waybill (the scan can be skipped and done later).
- The status becomes in transit (origin → destination).
- A box in transit shows a **"Track with DHL"** link built from a configurable URL template with the current waybill. Default template: `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id={waybill}`.

### Arriving

- Scan the box → "Mark as arrived". This defaults to the expected destination, which can be changed. The box's location is set and its status becomes at location.

### Unpacking (only at storage locations)

- From the box page: "Unpack". Show all contents, all ticked by default, with editable quantities, so items can be fully or partly unpacked.
- Unpacked quantities move to the location's **loose stock**. Merge them into existing loose holdings with the same item and best-before date.
- If the box ends up empty, ask "This box is now empty. Discard it?" with **Yes as the default**. Discarding soft-deletes it.
- Unpacking at an event venue is not allowed.

### Deleting boxes

- Any **empty** box can be deleted (soft delete) from its page or from a list of empty boxes at a location.
- A box that still contains items **cannot** be deleted. The user must unpack it first.

### Adjusting quantities (e.g. after an event)

- On a box or on loose stock: "Count / adjust". Enter what is actually there now, with a reason: used at event, damaged, lost, found, correction. Record it in the history log.

## Views

- **Home/dashboard:** each location with counts of boxes and items, boxes currently in transit (with tracking links), and warnings (low stock and best-before soon, from Phase 3).
- **Location page:** a photo grid of loose items with quantities, and a list of boxes with a contents preview (thumbnails and counts). Filter by company.
- **Box page:** code, status, location or route, photo, contents with photos and quantities, linked barcodes, actions (pack more, unpack, ship, arrive, print label, link barcode, delete if empty), and history.
- **Item page:** photos, companies, total quantity, a breakdown of where every holding is (location / box / best-before), and history.
- **Search:** across item names, box codes and barcodes, with filters for company and location.
- **Admin pages:** companies, locations, users.

## Authentication (must be swappable)

- In production, people will sign in with the **same username and password as their Nordic VMS login**. Oliver will connect this during integration. We do not yet know how VMS checks logins (it could be LDAP/Active Directory, a single sign-on system or its own database), so build for that uncertainty:
  - Put all credential checking behind one small interface, e.g. `verifyCredentials(username, password) → { ok, displayName?, email? }`, in a single clearly marked module.
  - Provide a **local provider** (usernames and hashed passwords stored in the app's own database) for development, Railway testing and demos, plus a **VMS provider stub** with clear TODO comments explaining exactly what Oliver needs to implement.
  - Select the provider with an environment variable (`AUTH_PROVIDER=local|vms`).
  - Roles are always stored in the app's own database, matched by username, regardless of provider.
  - Create an initial admin account from environment variables on first start.
- Login page with username and password. Sessions use secure, httpOnly cookies.

## Security and reliability (the app will be reachable from the internet)

- **Every page and API route requires login**, including box pages opened by scanning a QR with the phone camera. Redirect to login and then back to the original page.
- Rate-limit login attempts, use CSRF protection, validate all input with zod, and set sensible security headers.
- Photo uploads: check type and size, re-encode with sharp, resize (e.g. max 1600px plus a thumbnail), and **strip EXIF/GPS data**.
- Our users are sometimes in places with weak signal. Every action must clearly show success or failure, and **never fail silently**. If a save fails, say so plainly and keep what the user entered so they can retry. Prevent double submissions.

## Phases

### Phase 1: Foundation
Project setup, Docker and docker-compose, database schema and migrations, authentication with the local provider and swappable interface, admin pages for companies, locations and users, items with photos and multiple companies, loose holdings at locations, quick-add on phone, location page, item page, search, and the history log.

### Phase 2: Boxes and scanning
Boxes, packing, unpacking (with discard prompt), deleting empty boxes, QR label printing, the scanner (QR + Code 128, manual entry fallback), DHL barcode handling and normalisation, linking barcodes, shipping, arriving, and DHL tracking links. Deploy to Railway at the end of this phase (or earlier) so I can test scanning on my phone over HTTPS.

### Phase 3: Faster data entry and warnings
Bulk entry grid, duplicate item, "missing photo" filter, count/adjust with reasons, best-before dates with "expiring soon" warnings (configurable number of days), and low-stock warnings per item.

### Phase 4: Events
- Events with a name, venue location and dates.
- A packing list per event: items and quantities needed.
- "Pack for this event" pre-fills a box with the packing list from available loose stock.
- Ship all of an event's boxes in one action, mark all arrived, and a post-event step to count what's left and send boxes back or leave them at a storage location.
- **Optional DHL tracking automation:** if a DHL API key is set, periodically check tracking for in-transit boxes and flag (or mark) those DHL reports as delivered. If no key is set, this feature is simply off and everything else works. The server may not always have outbound internet access.

### Phase 5: Deployment and handover to Oliver
Prepare everything so moving to Nordic VMS is as easy as possible:
- Production-ready Docker setup that starts with one command, with migrations on start and persistent volumes for the database and photos.
- A clean Railway deployment (Postgres plus a persistent volume for photos) that I can show to Oliver.
- A `/api/health` endpoint for monitoring.
- Backup and restore scripts covering both the database (pg_dump) and the photo directory.
- A complete `.env.example` with every variable explained.
- **`DEPLOY.md` written for Oliver**, covering:
  - server requirements;
  - how to set it up;
  - why it must be served over **HTTPS on a public address** (phone cameras require HTTPS, and staff use it from other countries);
  - that outbound internet is only needed for the optional DHL tracking;
  - how to run backups and updates;
  - a dedicated section on **connecting VMS logins**: exactly what `verifyCredentials` receives and must return, where the stub lives, how to switch `AUTH_PROVIDER`, and how roles and the first admin work.
- A short `USER_GUIDE.md` for the team covering how to add items, pack, ship, scan, arrive, unpack and adjust.
