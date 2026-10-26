# 10 Brand Assets: CSPC

Status: logo integrated, photo reserved. Source files are official but carry no reuse licence.

## 1. Official sources

- Website: https://cspc.edu.ph/
- College Seal page: https://cspc.edu.ph/about/college-seal/
- Facebook: https://www.facebook.com/cspcofficial
- Footer copyright: `Copyright All Rights Reserved 2022, ICT-Web Development Unit`.

No official brand manual, clear-space rule, minimum-size rule, or colour standard was published. The seal page explains symbolism only and does not grant reuse rights. Ask the ICT-Web Development Unit for permission before a public launch.

## 2. Logo findings

No official SVG exists. The WordPress media API returned zero SVG results. Do not use a third-party vector trace as official.

| Variant | Source file | Local source | Notes |
| --- | --- | --- | --- |
| Current colour seal | `/wp-content/uploads/2025/08/Camarines_Sur_Polytechnic_Colleges_Logo-1.png` | `%TEMP%\opencode\cspc-logo\CSPC-seal-2025-500x519.png` | 500x519, RGBA, 159 KB. Preferred web raster. |
| Current colour seal, large | `/wp-content/uploads/2022/03/Camarines_Sur_Polytechnic_Colleges_Logo.png` | `%TEMP%\opencode\cspc-logo\CSPC-college-seal-1258x1305.png` | 1258x1305, RGBA, 423 KB. Primary print asset. |
| White seal | `/wp-content/uploads/2022/03/CSPC-White-Logo.png` | `%TEMP%\opencode\cspc-logo\CSPC-White-Logo-5344x5344.png` | 5344x5344, RGBA, 1.77 MB. Use on dark blue. |
| Legacy wordmark | `/wp-content/uploads/2022/03/CSPC-WEBSITEV2.png` | `%TEMP%\opencode\cspc-logo\CSPC-wordmark-2022-520x188.png` | 520x188, RGBA, 23 KB. Old lockup, avoid. |

The seal reads **1983**. The seal page prose says 1985. Do not alter the year or redraw the mark.

## 3. Assets in the repository

| File | Size | Use |
| --- | --- | --- |
| `public/images/cspc/seal.png` | 120x125, 24 KB | Header mark at 32px and favicon. Downscaled from the official 500x519 raster without cropping. |
| `public/images/cspc/campus-globe.jpg` | 2560x1711, 315 KB | Reserved campus photo. Not placed on a page yet. |
| `public/audio/called.mp3` | 1.25 s, 16 KB | Call alert on the student ticket page. Two chimes, mono 44.1 kHz at 96 kbps. |

The header uses the seal at 32px with the text `Qampus`. The favicon now points at the same file. The old custom `public/favicon.svg` was removed. `called.mp3` is BigSoundBank sound 2066, "Notification, LaSoLisa #4" by Joseph SARDIN, https://bigsoundbank.com/lasolisa-4-s2066.html, released CC0 (public domain, no attribution required). The chime repeats after 450 ms and is levelled to -15 LUFS; it is served from `public/`, never hotlinked.

## 4. Photo findings

Downloaded from `cspc.edu.ph` into `%TEMP%\opencode\cspc-photos`.

| File | Dimensions | Size | Mean luma | Verdict |
| --- | --- | --- | --- | --- |
| `cspc-blue-2-scaled.jpg` | 2560x1711 | 315 KB | 77 | Best. CSPC landmark globe and building, sky on the right for text. Chosen. |
| `cspc-blue-300x200-1-1.jpg` | 1440x810 | 256 KB | 46 | Same campus, but a dark overlay is baked in. Avoid. |
| `cspc-blue-scaled.jpg` | 2560x1711 | 166 KB | 42 | Landmark at dusk, too dark behind body text. Avoid. |
| `old-cspc-scaled.jpg` | 2560x1711 | 142 KB | 51 | Historic gate, dark and low contrast. Archive only. |
| `students-scaled.jpg` | 2560x1711 | 333 KB | 50 | Indoor ceremony, dark overlay. Avoid. |
| `students2-scaled.jpg` | 2560x1711 | 196 KB | 41 | Same scene, darker. Avoid. |
| `IMG_7710.jpg` | 2112x1600 | 1.74 MB | 107 | Computer laboratory, no people. Usable facility shot after compression. |
| `tour_1UINI.jpg` | 1440x1440 | 235 KB | n/a | National Privacy Commission DPO seal, not a campus photo. Do not use. |

`Facilities.jpg` is byte-identical to `cspc-blue-2-scaled.jpg`. Two news images, `classroom_11rgi.jpg` (5.8 MB) and `worldskills_1Y0wF.jpg` (5.1 MB), were downloaded but not reviewed. Do not use them until someone verifies the subject and consent.

## 5. Colour reference

Sampled from the official files, not from a published standard:

- Seal blue `#002A7A`
- Torch orange `#F28005`
- Flame red `#CC0000`
- Laurel green `#007236`
- Wordmark blue `#0E2E67`

Do not replace the project palette with these. Use them only for the mark and any official lockup.

## 6. Usage rules for this project

- Keep the seal aspect ratio. No stretch, crop, recolour, shadow, or outline.
- Use the colour seal on cream and white. Use the white seal on dark blue.
- Keep at least one seal-width of clear space around the mark.
- Credit `Camarines Sur Polytechnic Colleges` where the photo or seal carries the page.
- The site is a student project. If it is shared publicly, request written permission and add a credit line in the footer.
- Do not hotlink `cspc.edu.ph`. Copy assets into `public/` and serve them locally.

## 7. Next use

The reserved campus photo fits a single full-width band between the steps and the closing call to action, with a short caption. Do not put it behind the hero title; the landmark detail and the seal both lose legibility. Compress to WebP or AVIF and keep the delivered file under 200 KB before placing it.
