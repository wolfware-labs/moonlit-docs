<script setup lang="ts">
// A top-to-bottom flow diagram built from HTML and CSS rather than SVG.
//
// Drawing these as elements rather than as a rendered image buys three things
// an inlined SVG could not give us: the styles live in this component's <style>
// block, so they are extracted into the site stylesheet and survive client-side
// navigation; the palette is the site's own --vp-c-* tokens, so a diagram
// follows the theme toggle for free; and the boxes reflow on a narrow screen
// instead of scaling a fixed viewBox down until the labels are unreadable.
//
// Every entry in `flow` is one row. A row is either a single node, or a group
// holding nodes laid out side by side:
//
//   <FlowDiagram
//     caption="How a run reaches the step loop"
//     :flow="[
//       { title: 'moonlit CLI', detail: 'arguments, progress, exit codes' },
//       { group: 'wasmtime host', note: 'denied by default', items: [
//         { title: 'git', detail: 'tags, commits, push', mono: true },
//       ] },
//     ]" />

interface FlowNode {
  /** Bold first line. For a code-shaped name, set `mono`. */
  title: string
  /** Optional muted second line. */
  detail?: string
  /** Render the title in the monospace face, for plugin and command names. */
  mono?: boolean
}

interface FlowGroup {
  /** Label for the bounded region, e.g. a sandbox or host boundary. */
  group: string
  /** Optional line under the label, for what holds true across the group. */
  note?: string
  /** Nodes placed side by side inside the boundary. */
  items: FlowNode[]
}

type FlowRow = FlowNode | FlowGroup

const props = defineProps<{
  flow: FlowRow[]
  /** Rendered as a figcaption, and used as the accessible name. */
  caption?: string
}>()

const isGroup = (row: FlowRow): row is FlowGroup =>
  (row as FlowGroup).group !== undefined
</script>

<template>
  <figure class="flow-diagram" :aria-label="props.caption">
    <!-- An ordered list, because the order of the rows is the meaning of the
         diagram. A screen reader gets the sequence without seeing the arrows. -->
    <ol class="flow-diagram__rows">
      <li v-for="(row, i) in props.flow" :key="i" class="flow-diagram__row">
        <div v-if="isGroup(row)" class="flow-diagram__group">
          <p class="flow-diagram__group-label">{{ row.group }}</p>
          <p v-if="row.note" class="flow-diagram__group-note">{{ row.note }}</p>
          <div class="flow-diagram__group-items">
            <div
              v-for="(node, j) in row.items"
              :key="j"
              class="flow-diagram__node flow-diagram__node--inset"
            >
              <span
                class="flow-diagram__title"
                :class="{ 'flow-diagram__title--mono': node.mono }"
              >{{ node.title }}</span>
              <span v-if="node.detail" class="flow-diagram__detail">{{ node.detail }}</span>
            </div>
          </div>
        </div>

        <div v-else class="flow-diagram__node">
          <span
            class="flow-diagram__title"
            :class="{ 'flow-diagram__title--mono': row.mono }"
          >{{ row.title }}</span>
          <span v-if="row.detail" class="flow-diagram__detail">{{ row.detail }}</span>
        </div>
      </li>
    </ol>

    <figcaption v-if="props.caption" class="flow-diagram__caption">
      {{ props.caption }}
    </figcaption>
  </figure>
</template>

<style scoped>
.flow-diagram {
  margin: 28px 0;
}

.flow-diagram__rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.flow-diagram__row {
  display: flex;
  justify-content: center;
}

/* The connector between two rows. The stem and the chevron are drawn on the
   row's own pseudo-elements, so adding a row to `flow` adds its arrow too. */
.flow-diagram__row + .flow-diagram__row {
  position: relative;
  margin-top: 38px;
}

.flow-diagram__row + .flow-diagram__row::before {
  content: '';
  position: absolute;
  left: 50%;
  top: -32px;
  width: 2px;
  height: 26px;
  transform: translateX(-50%);
  background: var(--vp-c-text-3);
}

.flow-diagram__row + .flow-diagram__row::after {
  content: '';
  position: absolute;
  left: 50%;
  top: -14px;
  width: 8px;
  height: 8px;
  transform: translateX(-50%) rotate(45deg);
  border-right: 2px solid var(--vp-c-text-3);
  border-bottom: 2px solid var(--vp-c-text-3);
}

.flow-diagram__node {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: center;
  padding: 12px 20px;
  min-width: 260px;
  max-width: 460px;
  text-align: center;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.flow-diagram__node--inset {
  min-width: 0;
  flex: 1 1 160px;
  padding: 10px 14px;
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg);
}

.flow-diagram__title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--vp-c-text-1);
}

.flow-diagram__title--mono {
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
}

.flow-diagram__detail {
  font-size: 13px;
  line-height: 1.45;
  color: var(--vp-c-text-2);
}

.flow-diagram__group {
  width: 100%;
  padding: 14px 16px 16px;
  border: 1px dashed var(--vp-c-brand-1);
  border-radius: 10px;
  background: var(--vp-c-bg-alt);
}

.flow-diagram__group-label {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
}

.flow-diagram__group-note {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--vp-c-text-2);
}

.flow-diagram__group-items {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}

.flow-diagram__caption {
  margin-top: 12px;
  font-size: 13px;
  text-align: center;
  color: var(--vp-c-text-2);
}

/* On a narrow screen the grouped nodes stack rather than shrinking into
   unreadable columns. */
@media (max-width: 640px) {
  .flow-diagram__node {
    min-width: 0;
    width: 100%;
  }

  .flow-diagram__group-items {
    flex-direction: column;
  }
}
</style>
