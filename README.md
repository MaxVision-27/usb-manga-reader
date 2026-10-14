# USB Manga Reader

A manga reader that runs straight from a USB drive. Double-click `START.html` and read. No internet, no install, no admin rights, and no server. It works in Chrome or Edge on Windows.

- Library grid with covers, search, sorting, favorites, and unread counts
- A "Continue reading" row that reopens exactly where you left off
- Vertical scroll reader with optional two-page spreads, right-to-left or left-to-right
- The next chapter loads as you scroll, and chapters are marked read automatically
- Progress is saved **on the USB**, so it follows you between computers
- Supports folders of images, `.cbz`/`.zip`, and `.pdf`
- `` ` `` key instantly hides the reader behind a plain notes page

## Download

1. Click the green **Code** button above, then **Download ZIP**.
2. Extract the ZIP.
3. Copy the extracted folder onto your USB drive. Rename it to anything you like, for example `Notes`.
4. Open the folder and double-click **START.html**. A demo series is included so you can try it right away.

## Adding manga

Put each series in its own folder inside `manga\`:

```
manga\
  Series Name\
    cover.jpg              (optional)
    Chapter 1\  001.jpg 002.jpg ...
    Chapter 2\  ...
    Volume 3.cbz           (unpacked automatically)
    Volume 4.pdf           (converted to images automatically)
```

Then double-click **REBUILD-LIBRARY.bat** and reload the reader (F5).

- CBZ/ZIP files are unpacked and PDFs are converted to page images. The original file is then deleted from the drive, so keep your copies elsewhere.
- Plain image folders can also be picked up on any computer with **Connect USB → Rescan** inside the app.
- For left-to-right series, add an `info.txt` to the series folder containing `direction: ltr`.

## Manga packs

Extra series are posted separately on the [Releases](https://github.com/MaxVision-27/usb-manga-reader/releases) page, so the main download stays small. Each pack is a `.zip` holding one series folder.

**To install a pack:**

1. Open [Releases](https://github.com/MaxVision-27/usb-manga-reader/releases) and download the pack's `.zip` under **Assets**.
2. Extract it. You get a series folder, for example `Series Name\`.
3. Move that folder into `manga\` on your USB.
4. Double-click **REBUILD-LIBRARY.bat** (or use **Connect USB → Rescan** in the app), then press F5.

Packs can contain image folders, `.cbz`/`.zip`, or `.pdf` files. The rebuild handles all of them.

**To publish a pack:** zip the series folder itself, so the zip contains `Series Name\...` at the top. Then go to **Releases → Draft a new release**, name it `Pack: Series Name`, attach the zip, and publish. Only post manga you have the right to redistribute, such as your own work, work shared with the creator's permission, or public domain or Creative Commons titles.

## Saving progress to the USB

Click **Connect USB** in the library and pick the reader's folder (the one with `START.html`). After that, one "Allow" click per session. If a computer blocks the folder picker, progress still saves in that browser, and **Export / Import** move it to and from the USB.

## Keys

| Key | Action |
|---|---|
| Wheel, ↑ ↓, Space, PgUp/PgDn | Scroll |
| ← → | Previous / next page (follows reading direction) |
| `[` `]` | Previous / next chapter or volume |
| `2` | Spreads on/off |
| `O` | Offset spread pairs by one |
| `F` | Fullscreen |
| `Esc` | Back |
| `` ` `` | Hide screen / come back |
| `?` | Help |

See **README.txt** in the download for full instructions and troubleshooting.

Only add manga you have the right to copy, such as DRM-free purchases, free releases from creators, or scans of books you own.
