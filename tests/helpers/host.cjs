const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const base = path.resolve(__dirname, '../../src');

// Execute the real TypeScript modules with only the Obsidian host boundary mocked.
function harness(sourceRoot = base) {
  const base = sourceRoot;
  const timers = new Map();
  let nextTimer = 0;
  const host = { setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout(id) { timers.delete(id); } };
  class Element extends EventTarget {
    listeners = new Map();
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    click() { for (const fn of this.listeners.get('click') || []) fn(new Event('click')); }
    children = []; classList = { add() {} }; innerText = '';
    createEl() { const el = new Element(); this.children.push(el); return el; }
    createDiv() { return this.createEl(); }
    empty() { this.children = []; this.empties = (this.empties || 0) + 1; }
  }
  class TFolder { constructor() { this.path = 'fixture'; this.children = []; } }
  class TFile { constructor() { this.path = 'fixture/item.md'; this.basename = 'item'; this.extension = 'md'; this.parent = { name: 'fixture' }; } }
  class MarkdownRenderChild {
    callbacks = []; constructor(el) { this.containerEl = el; }
    register(fn) { this.callbacks.push(fn); }
    unload() { this.onunload?.(); this.callbacks.forEach(fn => fn()); }
  }
  const observers = [];
  class MutationObserver {
    active = true; constructor(fn) { this.fn = fn; observers.push(this); }
    observe() {} disconnect() { this.active = false; }
    fire() { if (this.active) this.fn(); }
  }
  class Plugin {}
  const obsidian = { TFolder, TFile, MarkdownRenderChild, parseYaml: () => ({}), Menu: class {}, Notice: class {} };
  const cache = {};
  function load(file) {
    if (cache[file]) return cache[file].exports;
    const module = { exports: {} }; cache[file] = module;
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText;
    const requireMock = (name) => {
      if (name === 'obsidian') return obsidian;
      const target = path.resolve(path.dirname(file), name) + '.ts';
      if (['FolderOverview.ts', 'styles/List.ts', 'utils/EventEmitter.ts', 'utils/OverviewBlockLifecycle.ts'].some(p => target === path.join(base, p))) return load(target);
      if (name.endsWith('/main') || name === '../main') return { __esModule: true, default: Plugin };
      if (name.endsWith('/functions')) return { buildYamlConfig: (_yaml, defaults) => defaults };
      if (name.endsWith('folderNoteFunctions')) return { getFolderNote: () => undefined, extractFolderName: () => '' };
      if (name.endsWith('/utils')) return { getFolderPathFromString: () => 'fixture' };
      if (name.endsWith('folderFunctions')) return { getExcludedFolder: () => undefined };
      return {};
    };
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { window: host, ...host, MutationObserver, console, Event, Intl, CSS: { escape: s => s } })(requireMock, module, module.exports);
    return module.exports;
  }
  const { FolderOverview } = load(path.join(base, 'FolderOverview.ts'));
  const { renderListOverview } = load(path.join(base, 'styles/List.ts'));
  const folder = new TFolder(); folder.children = [new TFile()];
  const children = [];
  const ctx = { sourcePath: 'fixture/overview.md', addChild(child) { children.push(child); } };
  const plugin = new Plugin();
  plugin.settings = { folderNoteName: '', defaultOverview: {} };
  const vaultListeners = new Map();
  plugin.app = { vault: { on(event, fn) { if (!vaultListeners.has(event)) vaultListeners.set(event, new Set()); vaultListeners.get(event).add(fn); }, off(event, fn) { vaultListeners.get(event)?.delete(fn); }, getAbstractFileByPath: p => p.endsWith('.md') ? Object.assign(new TFile(), { path: p, basename: 'overview' }) : folder } };
  const yaml = { folderPath: 'fixture', includeTypes: ['markdown'], depth: 2, showFolderNotes: true, sortBy: 'name', autoSync: true };
  const overview = new FolderOverview(plugin, ctx, '', new Element(), yaml);
  overview.listEl = new Element();
  const render = () => renderListOverview(plugin, ctx, new Element(), yaml, [], overview);
  const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  const flush = async () => { const queued = [...timers.values()]; timers.clear(); queued.forEach(fn => fn()); await settle(); };
  return { overview, render, flush, settle, timers, children, Element, observers, ctx, load, folder, plugin, vaultListeners, MutationObserver };
}

module.exports = { harness, base };
