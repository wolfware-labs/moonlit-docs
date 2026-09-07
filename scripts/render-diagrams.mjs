// Renders every diagrams/*.d2 source to an inlined SVG snippet under
// diagrams/generated/, which the docs pull in with <!--@include: -->.
//
// Rendering happens here, at build time, so no diagram library reaches the
// browser. Run through `npm run diagrams`; docs:dev and docs:build both depend
// on it, so the generated directory is disposable and is not committed.
//
// D2 emits its dark palette behind `@media (prefers-color-scheme: dark)`, which
// follows the operating system. VitePress instead toggles a `dark` class on
// <html>, so a reader who flips the site theme would otherwise get a diagram
// that disagrees with the page around it. rescopeDarkTheme rewrites that media
// block into `.dark`-prefixed rules to close the gap.

import { D2 } from '@d2lang/d2'
import fs from 'node:fs/promises'
import path from 'node:path'

const SRC_DIR = 'diagrams'
const OUT_DIR = path.join(SRC_DIR, 'generated')
const DARK_AT_RULE = '@media screen and (prefers-color-scheme:dark){'

// Pull the dark-theme block out of D2's stylesheet and re-emit each rule scoped
// to `.dark` instead. The block holds only flat `selector{...}` rules, so a
// brace scan is enough; anything nested would need a real CSS parser.
function rescopeDarkTheme(svg) {
  const start = svg.indexOf(DARK_AT_RULE)
  if (start === -1) return svg

  let depth = 1
  let i = start + DARK_AT_RULE.length
  for (; i < svg.length && depth > 0; i++) {
    if (svg[i] === '{') depth++
    else if (svg[i] === '}') depth--
  }
  if (depth !== 0) throw new Error('unbalanced braces in the D2 dark-theme block')

  const body = svg.slice(start + DARK_AT_RULE.length, i - 1)
  const rescoped = body.replace(
    /([^{}]+)\{([^{}]*)\}/g,
    (_, selectors, decls) =>
      selectors
        .split(',')
        .map((s) => `.dark ${s.trim()}`)
        .join(',') + `{${decls}}`
  )

  return svg.slice(0, start) + rescoped + svg.slice(i)
}

const d2 = new D2()
await fs.mkdir(OUT_DIR, { recursive: true })

const sources = (await fs.readdir(SRC_DIR))
  .filter((f) => f.endsWith('.d2'))
  .sort()

if (sources.length === 0) {
  console.log('no .d2 sources found in diagrams/')
  process.exit(0)
}

for (const file of sources) {
  const name = path.basename(file, '.d2')
  const source = await fs.readFile(path.join(SRC_DIR, file), 'utf8')

  const compiled = await d2.compile(source)
  const svg = await d2.render(compiled.diagram, {
    ...compiled.renderOptions,
    // 1 is D2's neutral grey; it sits behind the prose instead of competing
    // with the site's brand colour the way the blue default does.
    themeID: 1,
    darkThemeID: 200,
    pad: 16,
    noXMLTag: true,
    // Salting the generated element ids keeps two diagrams on one page from
    // colliding.
    salt: name
  })

  // VitePress compiles each page as a Vue template, i.e. as HTML, where <style>
  // is raw text and the XML CDATA wrapper D2 emits is a parse error. The CSS
  // inside needs no escaping once inlined, so drop the wrapper.
  // D2 indents the CSS inside its <style> blocks with tabs, and markdown-it
  // reads any line indented four spaces or more as an indented code block,
  // which tears the raw HTML block apart. A blank line would end the HTML block
  // for the same reason. Flattening the indentation keeps the whole SVG a
  // single raw block; SVG cares about neither.
  const inlined = rescopeDarkTheme(svg)
    .replaceAll('<![CDATA[', '')
    .replaceAll(']]>', '')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{2,}/g, '\n')

  const out = path.join(OUT_DIR, `${name}.md`)
  await fs.writeFile(out, `<figure class="d2-diagram">\n${inlined}\n</figure>\n`)
  console.log(`rendered ${file} -> ${out} (${(svg.length / 1024).toFixed(1)} KB)`)
}

process.exit(0)
