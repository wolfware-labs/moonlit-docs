<script setup>
import { ref, computed, onMounted } from 'vue'
import { withBase } from 'vitepress'

const RELEASE = 'https://github.com/wolfware-labs/moonlit/releases/latest/download'

const platforms = [
  {
    id: 'macos',
    label: 'macOS',
    primary: {
      title: 'Homebrew',
      lang: 'bash',
      command: 'brew install wolfware-labs/tap/moonlit'
    },
    others: [
      { title: 'Installer script', command: `curl --proto '=https' --tlsv1.2 -LsSf ${RELEASE}/moonlit-installer.sh | sh` },
      { title: 'npm', command: 'npm install -g @moonlitbuild/cli' }
    ]
  },
  {
    id: 'linux',
    label: 'Linux',
    primary: {
      title: 'Installer script',
      lang: 'bash',
      command: `curl --proto '=https' --tlsv1.2 -LsSf ${RELEASE}/moonlit-installer.sh | sh`
    },
    others: [
      { title: 'Homebrew', command: 'brew install wolfware-labs/tap/moonlit' },
      { title: 'npm', command: 'npm install -g @moonlitbuild/cli' }
    ]
  },
  {
    id: 'windows',
    label: 'Windows',
    primary: {
      title: 'PowerShell',
      lang: 'powershell',
      command: `irm ${RELEASE}/moonlit-installer.ps1 | iex`
    },
    others: [
      { title: 'Chocolatey', command: 'choco install moonlit' },
      { title: 'npm', command: 'npm install -g @moonlitbuild/cli' }
    ]
  }
]

const STORAGE_KEY = 'moonlit-install-platform'
const selected = ref('macos')
const detected = ref(null)
const copied = ref(false)

function detectPlatform() {
  const hint = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.userAgent || ''
  const h = hint.toLowerCase()
  if (h.includes('win')) return 'windows'
  if (h.includes('mac') || h.includes('iphone') || h.includes('ipad')) return 'macos'
  if (h.includes('linux') || h.includes('x11') || h.includes('android')) return 'linux'
  return null
}

onMounted(() => {
  detected.value = detectPlatform()
  let stored = null
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch (_) {
    stored = null
  }
  const known = platforms.some(p => p.id === stored)
  selected.value = known ? stored : (detected.value || 'macos')
})

function select(id) {
  selected.value = id
  copied.value = false
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch (_) {
    // Storage may be unavailable (private mode); the selection still applies for this page.
  }
}

const current = computed(() => platforms.find(p => p.id === selected.value) || platforms[0])

async function copy() {
  try {
    await navigator.clipboard.writeText(current.value.primary.command)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1600)
  } catch (_) {
    copied.value = false
  }
}
</script>

<template>
  <div class="install-command">
    <div class="install-tabs" role="tablist" aria-label="Operating system">
      <button
        v-for="p in platforms"
        :key="p.id"
        role="tab"
        class="install-tab"
        :class="{ active: p.id === selected }"
        :aria-selected="p.id === selected"
        @click="select(p.id)"
      >
        {{ p.label }}
        <span v-if="p.id === detected" class="install-detected">detected</span>
      </button>
    </div>

    <div class="install-panel" role="tabpanel">
      <div class="install-primary">
        <span class="install-title">{{ current.primary.title }}</span>
        <div class="install-code">
          <pre><code>{{ current.primary.command }}</code></pre>
          <button class="install-copy" type="button" :title="copied ? 'Copied' : 'Copy'" @click="copy">
            {{ copied ? 'Copied' : 'Copy' }}
          </button>
        </div>
      </div>

      <div class="install-others">
        <span class="install-title">Also available</span>
        <ul>
          <li v-for="o in current.others" :key="o.title">
            <span class="install-other-title">{{ o.title }}</span>
            <code>{{ o.command }}</code>
          </li>
        </ul>
      </div>
    </div>

    <div class="install-ci">
      <span class="install-title">Running in CI?</span>
      <ul>
        <li>
          <span class="install-other-title">GitHub Actions</span>
          <span>
            Add <code>wolfware-labs/setup-moonlit@v1</code> to your workflow.
            <a :href="withBase('/guide/github-actions')">Setup guide</a>
          </span>
        </li>
        <li>
          <span class="install-other-title">GitLab CI, Jenkins, or any container runner</span>
          <span>
            Use the <code>wolfware/moonlit</code> image with your repository mounted at <code>/work</code>.
            <a :href="withBase('/guide/installation#container-image')">Image details</a>
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.install-command {
  margin: 16px 0 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  overflow: hidden;
}

.install-tabs {
  display: flex;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
}

.install-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-2);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.2s, border-color 0.2s;
}

.install-tab:hover {
  color: var(--vp-c-text-1);
}

.install-tab.active {
  color: var(--vp-c-brand-1);
  border-bottom-color: var(--vp-c-brand-1);
}

.install-detected {
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.install-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.install-title {
  display: block;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-3);
  margin-bottom: 8px;
}

.install-code {
  position: relative;
}

.install-code pre {
  margin: 0;
  padding: 14px 88px 14px 16px;
  border-radius: 6px;
  background: var(--vp-code-block-bg);
  overflow-x: auto;
}

.install-code code {
  font-family: var(--vp-font-family-mono);
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--vp-c-text-1);
  background: none;
  padding: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.install-copy {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  transition: color 0.2s, border-color 0.2s;
}

.install-copy:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.install-others ul,
.install-ci ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.install-others li,
.install-ci li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  font-size: 14px;
  margin: 0;
}

.install-other-title {
  min-width: 110px;
  color: var(--vp-c-text-2);
}

.install-others code,
.install-ci code {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-1);
}

.install-ci {
  padding: 14px 16px;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
}

.install-ci a {
  color: var(--vp-c-brand-1);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 2px;
}

@media (max-width: 640px) {
  .install-tab {
    padding: 10px 12px;
    font-size: 13px;
  }
  .install-other-title {
    min-width: 100%;
  }
}
</style>
