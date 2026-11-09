# Design QA

final result: blocked

## Evidence

- Visual reference: user-supplied tools home screenshot, 1908 × 919.
- Source: https://qaworkbench.pages.dev/tools/?lang=ko, version 1.8.36.
- Implementation uses original public styles, scripts, font, guide images and templates packaged into a single HTML.
- User changes: brand region, fixed embedded A.I.matics logo with (QA) suffix, no logo controls, #36c25e selection colors, requested footer, personal storage namespace, no usage tracking, offline resources, manual TC input default.

## Functional checks

DOM-based checks passed: all inline JavaScript parses, home has 12 tools, all 12 tool screens plus settings/home initialize, TC drafts generate, boundary success/invalid input paths, pairwise combinations, decision rules, API data, field data, sample data, JSON differences, schema violations, diagnostic script generation, saved tool validation, CSV formula protection, XLSX ZIP header, fixed embedded logo bytes, removal of logo controls/export template/stored-logo override, #36c25e selection tokens, home preview/navigation, language switch and computed styles for selected menu/tab/filter/card. No runtime errors were recorded under the DOM test harness. Browser APIs absent from the harness were stubbed; no visual fidelity result is inferred from these checks.

## Blockers

- No approved browser control surface is exposed in this session. Desktop/mobile screenshots, visual comparison and real download/clipboard/file-selection behavior are unverified.
- Original attached logo file bytes are unavailable. The same brand’s public 2019 logo is embedded unchanged, with an adjacent (QA) text suffix. This is not the exact attached composite image file. Asset source: https://img.newspim.com/news/2019/12/02/1912020945426410.jpg. The logo picker, export template and saved-logo override have been removed.
- PDF extraction and image OCR are excluded from this standalone edition and report that limitation explicitly.

The file has been authored, but design QA has not passed. No visual-verification or complete source-parity claim is made.

Selection CSS: #36c25e base; 14% selected fill, 42% border, 8% hover, 55% focus. Computed DOM styles match the selected menu/tab/filter/card fill and border colors.

## TESTCASE_FORM export update

The uploaded netlify-deploy.zip matched the prior HTML byte for byte and was used as the change baseline. Excel TC export now uses the supplied workbook’s sheet, widths, styles, theme and importance conditional formatting. Generated rows use the ten A:J columns, with the original K-column importance guide preserved. CSV/copy column customization is unchanged.

Verification: actual asynchronous Excel-download event with filtered/selected rows and no CSV columns selected; duplicate-click guard; stable/imported IDs; empty/overlength guards; 1,001-case output; generated eight-case example. Independent openpyxl reads verify headers, cell styles, widths, theme, High/Medium/Low and P1/P2/P3 values, string escaping, literal formula-like text, multiline data and extended conditional-format ranges. Author/path/person metadata is omitted from the embedded template. No new browser visual-verification claim is made.
