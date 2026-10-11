import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const ROOT_LAYOUT_PATH = resolve(REPO_ROOT, 'frontend/src/routes/+layout.svelte');
const GLOBAL_CSS_PATH = resolve(REPO_ROOT, 'frontend/src/app.css');
const TOKEN_PATHS = [
  'frontend/src/lib/styles/tokens/fonts.css',
  'frontend/src/lib/styles/tokens/colors.css',
  'frontend/src/lib/styles/tokens/typography.css',
  'frontend/src/lib/styles/tokens/spacing.css',
  'frontend/src/lib/styles/tokens/base.css',
] as const;
const REQUIRED_COMPONENTS = [
  'SignumButton.svelte',
  'SignumCard.svelte',
  'SignumTag.svelte',
  'SignumSearchInput.svelte',
  'SignumFilterChip.svelte',
  'SignumStepper.svelte',
  'SignumObservationCard.svelte',
  'SignumConfidenceIndicator.svelte',
  'SignumAdThumbnail.svelte',
  'SignumLayerToggle.svelte',
  'SignumClaimCard.svelte',
  'SignumDropZone.svelte',
] as const;

test('frontend root layout imports the global stylesheet', async () => {
  const rootLayout = await readFile(ROOT_LAYOUT_PATH, 'utf8');
  const globalCss = await readFile(GLOBAL_CSS_PATH, 'utf8');

  assert.match(rootLayout, /import\s+['"]\.\.\/app\.css['"];?/);
  assert.match(rootLayout, /import\s+\{\s*base,\s*resolve\s*\}\s+from\s+['"]\$app\/paths['"];?/);
  assert.match(rootLayout, /src=\{`\$\{base\}\/brand\/logo\.svg`\}/);
  assert.match(globalCss, /body\s*\{/);
  assert.match(globalCss, /@import url\(['"]\.\/lib\/styles\/tokens\/fonts\.css['"]\)/);
  assert.match(globalCss, /@import url\(['"]\.\/lib\/styles\/tokens\/colors\.css['"]\)/);
  assert.match(globalCss, /@import url\(['"]\.\/lib\/styles\/tokens\/typography\.css['"]\)/);
  assert.match(globalCss, /@import url\(['"]\.\/lib\/styles\/tokens\/spacing\.css['"]\)/);
  assert.match(globalCss, /@import url\(['"]\.\/lib\/styles\/tokens\/base\.css['"]\)/);
  assert.doesNotMatch(
    globalCss,
    /body,\s*button,\s*input,\s*textarea,\s*select\s*\{\s*font-family:\s*inherit;/,
  );
});

test('frontend keeps the Signum design tokens, brand assets, and core component hooks connected', async () => {
  await Promise.all(TOKEN_PATHS.map((path) => access(resolve(REPO_ROOT, path))));
  await Promise.all(
    ['logo.svg', 'mark.svg', 'logo-reversed.svg'].map((asset) =>
      access(resolve(REPO_ROOT, 'frontend/static/brand', asset)),
    ),
  );
  await Promise.all(
    REQUIRED_COMPONENTS.map((component) =>
      access(resolve(REPO_ROOT, 'frontend/src/lib/components/signum', component)),
    ),
  );

  const fonts = await readFile(resolve(REPO_ROOT, TOKEN_PATHS[0]), 'utf8');
  const logo = await readFile(resolve(REPO_ROOT, 'frontend/static/brand/logo.svg'), 'utf8');
  const reversedLogo = await readFile(
    resolve(REPO_ROOT, 'frontend/static/brand/logo-reversed.svg'),
    'utf8',
  );
  const colors = await readFile(resolve(REPO_ROOT, TOKEN_PATHS[1]), 'utf8');
  const typography = await readFile(resolve(REPO_ROOT, TOKEN_PATHS[2]), 'utf8');
  const detailPage = await readFile(
    resolve(REPO_ROOT, 'frontend/src/routes/cases/[caseId]/+page.svelte'),
    'utf8',
  );
  const displayHelpers = await readFile(resolve(REPO_ROOT, 'frontend/src/lib/display.ts'), 'utf8');

  assert.match(colors, /--observation-fill:/);
  assert.match(colors, /--interpretation-fill:/);
  assert.match(colors, /--task-fill:/);
  assert.doesNotMatch(fonts, /Newsreader|Source Serif|Georgia|Times New Roman/);
  assert.doesNotMatch(logo, /Source Serif|Georgia|Times New Roman/);
  assert.doesNotMatch(reversedLogo, /Source Serif|Georgia|Times New Roman/);
  assert.match(logo, /IBM Plex Sans/);
  assert.match(reversedLogo, /IBM Plex Sans/);
  assert.doesNotMatch(typography, /--font-serif:/);
  assert.match(typography, /--font-display:\s*var\(--font-sans\)/);
  assert.match(typography, /--font-reading:\s*var\(--font-sans\)/);
  assert.match(detailPage, /<h2 id="analysis-heading">Evidence and interpretation<\/h2>/);
  assert.match(detailPage, /caseDisplayTitle\(caseData\.compatibility_case_id, caseData\.title\)/);
  assert.match(detailPage, /<SignumObservationCard/);
  assert.doesNotMatch(detailPage, /<h2>Claims<\/h2>/);
  assert.doesNotMatch(detailPage, /<SignumClaimCard/);
  assert.match(displayHelpers, /export function caseDisplayTitle/);
  assert.match(displayHelpers, /title\s*\?\.\s*trim\(\)/);
  assert.match(displayHelpers, /replace\(\/-\[a-f0-9\]\{8\}\$\/i/);
});

test('analytical support uses native progressive disclosure', async () => {
  const observationCard = await readFile(
    resolve(REPO_ROOT, 'frontend/src/lib/components/signum/SignumObservationCard.svelte'),
    'utf8',
  );
  const claimCard = await readFile(
    resolve(REPO_ROOT, 'frontend/src/lib/components/signum/SignumClaimCard.svelte'),
    'utf8',
  );
  const glossary = await readFile(
    resolve(REPO_ROOT, 'frontend/src/routes/glossary/+page.svelte'),
    'utf8',
  );

  assert.match(observationCard, /<details class="observation-row"/);
  assert.match(observationCard, /<summary class="observation-row__summary">/);
  assert.doesNotMatch(observationCard, /open=\{index === 1\}/);
  assert.match(observationCard, /claimsForObservation/);
  assert.match(observationCard, /<SignumClaimCard/);
  assert.match(observationCard, /More analysis/);
  assert.match(observationCard, /Observation/);
  assert.match(observationCard, /Interpretation/);
  assert.doesNotMatch(observationCard, /epistemic-label/);
  assert.doesNotMatch(observationCard, /class="observation-provenance"/);
  assert.match(claimCard, /<article class="reading-row">/);
  assert.match(claimCard, /reading-row__lens/);
  assert.doesNotMatch(claimCard, /epistemic-label/);
  assert.doesNotMatch(claimCard, /<details/);
  assert.doesNotMatch(claimCard, /<summary/);
  assert.match(claimCard, /\/glossary\?from=/);
  assert.match(glossary, /class="inspector-disclosure"/);
});

test('frontend exposes the decode and browse surfaces', async () => {
  const layout = await readFile(ROOT_LAYOUT_PATH, 'utf8');
  const home = await readFile(resolve(REPO_ROOT, 'frontend/src/routes/+page.svelte'), 'utf8');
  const analyse = await readFile(
    resolve(REPO_ROOT, 'frontend/src/routes/analyse/+page.svelte'),
    'utf8',
  );
  const workbench = await readFile(
    resolve(REPO_ROOT, 'frontend/src/routes/workbench/+page.svelte'),
    'utf8',
  );
  const glossary = await readFile(
    resolve(REPO_ROOT, 'frontend/src/routes/glossary/+page.svelte'),
    'utf8',
  );
  const layerToggle = await readFile(
    resolve(REPO_ROOT, 'frontend/src/lib/components/signum/SignumLayerToggle.svelte'),
    'utf8',
  );
  const dropZone = await readFile(
    resolve(REPO_ROOT, 'frontend/src/lib/components/signum/SignumDropZone.svelte'),
    'utf8',
  );
  const adThumbnail = await readFile(
    resolve(REPO_ROOT, 'frontend/src/lib/components/signum/SignumAdThumbnail.svelte'),
    'utf8',
  );
  const layoutLoad = await readFile(resolve(REPO_ROOT, 'frontend/src/routes/+layout.ts'), 'utf8');
  const caseDetail = await readFile(
    resolve(REPO_ROOT, 'frontend/src/routes/cases/[caseId]/+page.svelte'),
    'utf8',
  );
  const caseLoad = await readFile(
    resolve(REPO_ROOT, 'frontend/src/routes/cases/[caseId]/+page.ts'),
    'utf8',
  );
  const directDecode = await readFile(
    resolve(REPO_ROOT, 'frontend/src/routes/decoded/+page.svelte'),
    'utf8',
  );
  const deconstructionHelpers = await readFile(
    resolve(REPO_ROOT, 'frontend/src/lib/deconstruction.ts'),
    'utf8',
  );
  const method = await readFile(
    resolve(REPO_ROOT, 'frontend/src/routes/method/+page.svelte'),
    'utf8',
  );
  const casesIndex = await readFile(
    resolve(REPO_ROOT, 'frontend/src/routes/cases/+page.svelte'),
    'utf8',
  );

  assert.match(layout, />\s*Analyses/);
  assert.match(layout, />\s*Concepts/);
  assert.match(layout, />\s*Method/);
  assert.match(layout, />\s*Analyse an ad/);
  assert.doesNotMatch(layout, />\s*Inspect/);
  assert.match(layout, />Explore<\/span>/);
  assert.match(layout, />Learn<\/span>/);
  assert.match(layout, />Create<\/span>/);
  assert.match(home, /An archive of decoded advertisements/);
  assert.match(home, /Explore patterns across advertising/);
  assert.match(home, /From what is visible to what is made to seem natural/);
  assert.match(home, /Judith Williamson/);
  assert.doesNotMatch(home, /SignumDropZone/);
  assert.match(analyse, /Analyse an advertisement\./);
  assert.match(analyse, /SignumDropZone/);
  assert.match(home, /data\.counts\.sourced/);
  assert.match(home, /data\.counts\.direct/);
  assert.match(layoutLoad, /direct:\s*cases\.length - sourced/);
  assert.match(layoutLoad, /trailingSlash\s*=\s*['"]always['"]/);
  assert.match(caseDetail, /\/workbench\?case=/);
  assert.match(caseDetail, /Overall interpretation/);
  assert.match(caseDetail, /Evidence and interpretation/);
  assert.match(caseDetail, /Concepts used in this analysis/);
  assert.match(caseDetail, /About this interpretation/);
  assert.match(caseDetail, /Analysis map/);
  assert.doesNotMatch(caseDetail, /Generated analysis/);
  assert.doesNotMatch(caseDetail, /Synthesized/);
  assert.match(caseDetail, /case-adjacent-nav/);
  assert.match(caseLoad, /previousCase:/);
  assert.match(caseLoad, /nextCase:/);
  assert.match(directDecode, /\/glossary\?concept=/);
  assert.match(adThumbnail, /item\.archive\.analytical_title/);
  assert.match(adThumbnail, /item\.archive\.brand/);
  assert.match(adThumbnail, /item\.archive\.year_label/);
  assert.doesNotMatch(adThumbnail, /visible details/);
  assert.doesNotMatch(adThumbnail, /interpretations/);
  assert.doesNotMatch(
    `${layout}\n${home}\n${analyse}\n${workbench}\n${dropZone}\n${adThumbnail}`,
    /\bClaims\b/,
  );
  assert.match(workbench, /Move from what the ad shows to what it may mean/);
  assert.match(glossary, /Controlled concepts used by the current Decode corpus/);
  assert.match(glossary, /glossary-inspector/);
  assert.match(glossary, /Ads using this concept/);
  assert.match(glossary, /name="concept"/);
  assert.match(casesIndex, /Featured first/);
  assert.match(casesIndex, /conceptIdsForCase/);
  assert.match(method, /Judith Williamson/);
  assert.match(method, /What the ad shows/);
  assert.match(method, /A supported reading, not ground truth/);
  assert.match(method, /signumWorkbenchData/);
  assert.doesNotMatch(
    method,
    /caseId:\s*['"]ad_[a-f0-9]{24}['"]/,
    'Method examples must resolve the current canonical Advertisement from generated archive data.',
  );
  assert.match(layerToggle, /Overview/);
  assert.match(layerToggle, /What it shows/);
  assert.match(layerToggle, /What it may mean/);
  assert.match(layerToggle, /Concepts/);
  assert.match(layerToggle, /Broader meaning/);
  assert.match(deconstructionHelpers, /claimsForObservation/);
  assert.match(deconstructionHelpers, /rankObservationsForReading/);
  assert.match(deconstructionHelpers, /rankClaimsForReading/);
  assert.match(deconstructionHelpers, /buildGlossary/);
});
