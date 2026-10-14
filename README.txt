USB MANGA READER
================

Runs straight from the USB in Chrome or Edge. No internet, no install, no admin.


1. FIRST-TIME SETUP
-------------------
Everything lives in one folder on the USB:

    D:\Notes\START.html
    D:\Notes\README.txt
    D:\Notes\REBUILD-LIBRARY.bat
    D:\Notes\app\
    D:\Notes\data\
    D:\Notes\manga\

You can rename the Notes folder or move it, as long as everything inside
stays together.

Double-click START.html. If it opens in something other than Chrome/Edge,
right-click START.html > Open with > Microsoft Edge (or Google Chrome).


2. SAVING PROGRESS TO THE USB
-----------------------------
Progress is always saved in the browser you're using. To ALSO save it on the
USB (so it follows you between computers):

  - First time on a computer: click "Connect USB" (top right of the library),
    pick the Notes folder on the USB (the one with START.html in it), and
    allow editing.
  - Every session after that: click "Connect USB" once and press "Allow".
    The browser requires this click. It can't be skipped.

The button shows "USB (tick) saved" when it's working.
Progress lives in data\progress.js. data\progress.bak.js is a copy taken at
the start of each session.

If the school blocks the folder picker:
  - At school: progress still saves inside that laptop's browser.
  - To carry it home: click "Export". It saves progress.js to Downloads. Copy
    that file into the USB's data folder, replacing the old one.
  - To bring USB progress into a browser by hand: click "Import" and choose
    data\progress.js from the USB.
  Progress from different places is merged: for each series, whichever copy
  was changed most recently wins.

Close the reader tab and use "Safely Remove / Eject" before pulling the USB
out. FAT32 drives can lose recent writes if yanked.


3. ADDING MANGA
---------------
Put each series in its own folder inside manga\. Inside a series folder,
each folder of images is one chapter:

    manga\
      One Piece\
        cover.jpg                (optional; otherwise page 1 is the cover)
        info.txt                 (optional, see below)
        Chapter 001\  001.jpg 002.jpg ...
        Chapter 002\  ...
        Chapter 010.5\ ...
      Some Oneshot\
        01.png 02.png ...        (images directly in the series = one chapter)
      Berserk\
        Vol 01\Chapter 001\ ...  (nested folders are fine)
        Berserk c050.cbz         (CBZ/ZIP files are fine, see below)
        Berserk Volume 2.pdf     (PDFs too: one PDF = one chapter/volume)

Images: jpg, jpeg, png, webp, gif, avif, bmp, svg.
Sorting is "natural": 2 comes before 10, and 10.5 sits between 10 and 11.
You don't need to zero-pad or rename anything.
Files and folders starting with a dot (.) are ignored.

THEN UPDATE THE LIBRARY, one of two ways:

  A) At home (handles everything, including .cbz/.zip/.pdf):
     Double-click REBUILD-LIBRARY.bat on the USB. A window lists what it
     found. Press a key to close it, then reload START.html (F5).
     Each .cbz/.zip is unpacked, and each .pdf is turned into page images,
     in a folder with the same name. The original file is DELETED once that
     works (keep your originals on your PC). Broken files are kept and
     reported.
     PDFs can take several minutes per volume. A progress bar shows the
     current page. Leave the window open until it
     says "Done".

  B) At school (plain image folders only):
     Click "Connect USB", then "Rescan". New series appear right away.
     .cbz/.zip/.pdf files are skipped. Convert them at home with option A.

info.txt (optional, in a series folder; every line is optional):

    title: One Piece (Colored)
    direction: ltr

direction: rtl = right-to-left (Japanese manga, the default)
direction: ltr = left-to-right (Korean/Chinese manhwa, Western comics)
You can also flip it per series with the direction button in the app.

To remove the demo: delete manga\_Demo, then rebuild or rescan.

MANGA PACKS: extra series may be posted on the GitHub Releases page:
  https://github.com/MaxVision-27/usb-manga-reader/releases
Download a pack's .zip, extract it, move the series folder into manga\,
then rebuild or rescan.


4. USING IT
-----------
Library: search, sort (A-Z / Recently read / Recently added), the star
button shows favorites only. Numbers on covers = unread chapters.
Series page: right-click any chapter to mark it read/unread.

Reader keys (press ? any time to see these):
  Mouse wheel, Up/Down, Space, PgUp/PgDn   scroll
  Click top / bottom third of the screen   scroll one screen up / down
  Click the middle                         show / hide the top bar
  Left / Right arrows                      previous / next page (one spread
                                           at a time with spreads on;
                                           follows reading direction)
  [  ]                                     previous / next chapter or volume
  2                                        spreads on/off
  O                                        offset spread pairs by one
  F                                        fullscreen
  Esc                                      back
  Ctrl + mouse wheel                       zoom

The next chapter loads below as you scroll. A chapter is marked read once
you reach its end. START.html reopens where you left off.

HIDE SCREEN: press the ` key (top-left, under Esc). A plain notes page covers
everything; press ` again to come back exactly where you were. The notes
page also appears automatically whenever the window loses focus
(Alt+Tab, clicking another window).


5. TROUBLESHOOTING
------------------
"No manga found"
  -> Run REBUILD-LIBRARY.bat (home) or Connect USB + Rescan (school), then
     press F5. Check the folder is named exactly "manga".

New manga doesn't show up
  -> Rebuild or Rescan, then F5.

Some pages show as grey/blank boxes
  -> Files were renamed or moved after the last rebuild. Rebuild or Rescan.

Chapters in the wrong order
  -> Make sure the chapter number is in the folder name ("Chapter 7",
     "Ch 7", "007" all work). Avoid writing numbers as words.

Spread pairs are off by one (left and right pages swapped)
  -> Press O in the reader. It's remembered per series.

Pages read in the wrong direction
  -> Click RTL/LTR in the reader, or add info.txt with "direction: ltr".

REBUILD-LIBRARY.bat closes instantly or says scripts are disabled
  -> Right-click app\rebuild.ps1 > Run with PowerShell. If Windows says the
     file is blocked: right-click it > Properties > tick "Unblock" > OK.

"Connect USB" does nothing, or shows an error
  -> Click it again (the browser sometimes needs a second click).
  -> If it still fails, the school has blocked it: use Export/Import
     (section 2). Reading still works fine.
  -> If it says to pick the folder with START.html: you picked the wrong
     folder. Pick D:\Notes (open the USB, click Notes once, then
     "Select Folder").

Button shows "USB (warning) not saving"
  -> The USB was unplugged or permission expired. Click the button again.

Progress went backwards / looks wrong
  -> Close the tab. In data\, rename progress.bak.js to progress.js
     (delete or rename the bad one first). Reopen START.html.
     Note: the browser's own copy is merged back in, newest per series wins.

Nothing happens when double-clicking START.html, or a blank page
  -> Open it with Edge or Chrome (right-click > Open with). Make sure the
     app, data and manga folders are next to START.html.


6. SCHOOL LAPTOP TEST CHECKLIST (about 3 minutes)
-------------------------------------------------
 [ ] 1. Double-click START.html. The library shows "Demo (delete me)".
 [ ] 2. Open the demo, click "Start reading". Pages appear. Page 1 sits alone,
        then pairs with the right-hand page first. Page 5 (wide) fills a row.
 [ ] 3. Scroll to the bottom. Chapter 2 loads below. Keep going to
        "All caught up".
 [ ] 4. Press ` (notes page appears), press ` again (back in place).
        Alt+Tab away and back: the notes page should be showing.
 [ ] 5. Press F (fullscreen), then Esc.
 [ ] 6. Esc back to the library, click "Connect USB", pick the Notes
        folder on the USB, Allow.
          Works  -> button shows "USB (tick) saved". Picker is OK here.
          Fails  -> note the error. Use Export/Import at this laptop.
 [ ] 7. If step 6 worked: click "Rescan". It should say "Found 1 series".
 [ ] 8. Read a little, close the tab, open START.html again. It reopens
        at the same spot.
 [ ] 9. At home, open START.html from the USB. "Continue reading" shows the
        demo at the same spot (only if step 6 worked or you Exported).
