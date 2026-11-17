# Events Inventory: user guide

The app keeps track of all our event equipment and materials: what we have, where it is,
and what's in which box. **Update it the moment something happens** (you pack a box, it's
picked up, it arrives), so it's always right.

Open it on your phone and sign in. The buttons along the bottom are:

- **Home**: what's going on (warnings, events, boxes in transit, locations), and **Find anything**.
- **Items**: everything we have.
- **Scan** (the big button in the middle): open a box by its label.
- **Boxes**: every box and what's in it.
- **More**: events, bulk entry, recent activity, the Excel download and settings.

---

## The basics

- **Item**: one kind of thing, e.g. "Functional Future roll-up banner" or "NL tote bag",
  with a photo. One item can have many copies in different places.
- **Type** (optional): a label for what an item is, e.g. Banner, Leaflet or Booklet. It makes
  items quicker to find.
- **Location**: a storeroom (e.g. Copenhagen storeroom) or an event venue.
- **Box**: anything that travels. Every box has a number like **BOX-0047**. A stand
  shipped on its own is also a "box".
- Things are either **in a box** or **loose** at a location (on a shelf, not in a box).

---

## Adding items

**+ Add item** (on Home and on Items):
1. Take a photo. You can skip it and add one later.
2. Type the name. If a similar item already exists, the app suggests it. Tap it to add stock to that item instead of creating a duplicate.
3. Pick the type if you want one. The app suggests it from the name ("…roll-up banner" → Banner);
   tap another to change it. **+ New type** adds one to the list for everyone.
4. Pick the company or companies, the quantity, and where it is (loose at a location, or in a box).
5. **Save**, or **Save & add another**.

**Lots of items at once:** More → **Bulk entry**, best on a computer. It works like a
spreadsheet: Tab moves right, Enter moves down, Ctrl+D copies the cell above. You can also
paste rows straight from Excel or Google Sheets (columns: name, type, companies, quantity,
location, box; the type column can be left out). Nothing is saved until every row is correct.

**Similar item:** open the item → **Duplicate**.
**More of an item arrived:** open the item → **+ Add stock**.

**Items that have no type yet:** More → **Items without a type**. Choose a type, tick the items
that belong to it (the ones whose name mentions the type are ticked for you), and save. Repeat
for the next type. To change one item's type, open it → **Edit**.

---

## Packing a box

Home or Boxes → **Pack a box**:
1. Choose where the box is now. Create a new box, or reuse an empty one that's there.
2. Tap **Pack items** and set how many of each loose item go in. With a long list, filter it
   by typing or by tapping a type.
3. Optional: take a photo of the packed box.
4. If the box will sit in storage, **Print label** and stick the QR label on it. If it ships
   straight away, the DHL label is enough.

**Print contents** on the box page prints a list of everything in the box, to put inside it or show at customs.

## Shipping

Open the box (scan it, or find it under Boxes) → **Ship**:
1. Choose the destination.
2. Scan the **DHL label**. Point the camera at the whole label. The app picks up the piece
   number (starts with JD) and the waybill (10 digits) by itself.
   - If it says "that's DHL's routing barcode", scan the bottom barcode instead.
   - You can skip the scan and link the label later (box page → **Link a DHL barcode**).
3. **Ship**. The box shows as *in transit*, with a **Track with DHL** button.

## Scanning

Tap **Scan** and point the camera at a box's QR label or DHL label. The box opens.

- **Can't scan?** Type the code instead: BOX-0047, or the number under the barcode.
- **A DHL label the app doesn't know yet:** it asks whether to link it to a box, or to create a new box with it.

## Arriving

Scan the box → **Mark as arrived**. It suggests where the box was heading. Change it if it
ended up somewhere else.

## Unpacking

Open the box → **Unpack**. Everything is ticked. Untick or lower the numbers to unpack only part of it.
Unpacked items become loose stock at that location. If the box ends up empty, the app asks
whether to discard it.

## Counting and adjusting

When the real numbers differ from the app, open the box (or the location's loose stock, or
**Adjust** on an item's page) → **Count / adjust**.
1. Type what's **actually there now**.
2. Pick a reason: used at event, damaged, lost, found or correction. Add a note if useful.

---

## Events

More → **Events** (or the Events section on Home) → **+ New event**: name, venue and dates.

1. **Packing list:** add the items and how many are needed. Find them by typing (name, type or
   company), or tap a type to browse everything of that type.
2. **Pack a box for this event:** the quantities are filled in with what's still missing,
   from the stock where you are. Change them if needed, then pack. Repeat for each box.
   The event page shows progress per item (e.g. 120 / 300).
3. **Ship N boxes to the venue:** ships all of the event's boxes in one go. Then scan each
   box's DHL label (box page → **Link a DHL barcode**).
4. **Mark N boxes arrived** at the venue.
5. After the event, **Wrap up after the event**:
   - count what's left in each box, and anything that was unpacked at the stand;
   - choose what happens to leftovers and to each box: pack them back into a box, ship it
     (back to storage), leave it at the venue, or discard it if it's empty;
   - **Finish**. Everything is saved together.

**Print packing list** on the event page prints the list with a tick box per line, plus a contents sheet for each box.

---

## Finding things

- **Items:** everything we have. Each card shows the type, how many there are and where
  (e.g. "BOX-0012 · Copenhagen storeroom", or "3 places").
  - Search by name, type, company or description. The words can be in any order, and
    company initials work too ("FF banner").
  - Tap a type (Banner, Leaflet…) to see only that type.
  - Filter by company or location. **More filters** has in stock / low stock / out of stock,
    items without a photo, and archived items.
- **Boxes:** every box, grouped by where it is (boxes in transit first), with what's inside.
  Search by box number, DHL number, description or contents. Filter by location or event.
- **Home → Find anything:** one search across items, boxes, events and locations.
- **A location's page** (tap it on Home) has its own search: it narrows down the loose items
  and boxes there, by item name, type, company, box number or description.
- **Home** also shows each location, boxes in transit, upcoming events, and warnings (low
  stock, items without a photo).
- An item's page shows **every place it is** (loose or in which box) and its full history.
  Tap its type to see everything of that type.
- The **← back link** at the top of an item or box returns to where you opened it from, with
  your search and filters kept.
- More → **Recent activity:** everything that changed, newest first. Filter by person.
- More → **Download inventory (Excel):** everything as it is right now, in a spreadsheet.

## Good to know

- **Weak signal?** Every button tells you whether it worked. If something didn't save, the
  app says so and keeps what you typed. Just tap it again; it won't be saved twice.
- **Mistakes** can be fixed:
  - shipped to the wrong place? Mark it as arrived where it really is;
  - wrong numbers? Count / adjust.

  The history shows who did what and when.
- **Low-stock warning:** open the item → **Edit** → "Low-stock warning below".
- Administrators manage companies, item types (rename, delete), locations and users under More.
