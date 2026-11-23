# Third-party software

The optional on-device HUD reader loads [Tesseract.js](https://github.com/naptha/tesseract.js), pinned to 6.0.1, with its worker/core and English language data from jsDelivr. Tesseract.js is Apache-2.0 licensed; see the [upstream license](https://github.com/naptha/tesseract.js/blob/master/LICENSE). The site sends no video frames to the CDN. This runtime dependency does not require a framework or build step.

## React Bits

The site's vanilla folder and branched navigation use proportions, paths and motion inspired by [FolderFloat](https://reactbits.dev/micro/folder-float) and [BranchedMenu](https://reactbits.dev/micro/branched-menu). The header uses a smaller folder, site destinations, monochrome colors and no shadows. React and Matter.js are not included.

Source: https://github.com/DavidHDev/react-bits

MIT + Commons Clause License Condition v1.0

Copyright (c) 2026 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software **as part of an application, website, or product**, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

## Commons Clause Restriction

You may use this Software, including for any commercial purpose, **so long as you do not sell, sublicense, or redistribute the components themselves-whether alone, in a bundle, or as a ported version.**

## No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


# Vercel Analytics

@vercel/analytics 2.0.1 provides the vanilla browser SDK in assets/vendor/vercel-analytics.js. Its MIT license is included in assets/vendor/vercel-analytics.LICENSE.txt.

## Self-hosted libraries

Files in `assets/vendor/` are unmodified copies, served from this site so pages work on networks that block public CDNs.

- three.js 0.134.0 (`three/three.min.js`, `three/GLTFLoader.js`): MIT License, Copyright 2010-2021 three.js authors. https://github.com/mrdoob/three.js
- Vanta.js 0.5.24 (`vanta/vanta.net.min.js`): MIT License, Copyright 2018 Teng Bao. https://github.com/tengbao/vanta
- Tesseract.js 6.0.1 and tesseract.js-core 6.0.0 (`tesseract/`): Apache License 2.0. https://github.com/naptha/tesseract.js
- English LSTM model from @tesseract.js-data/eng 1.0.0 (`tesseract/lang/eng.traineddata.gz`): Apache License 2.0, from the Tesseract OCR project.

## Valorant data

`assets/valorant/` holds map, agent, ability, rank and Vandal skin names and images copied from valorant-api.com by `tools/update-valorant-data.cjs`. Valorant and its assets belong to Riot Games. Kixot was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
