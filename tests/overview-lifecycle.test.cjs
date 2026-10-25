const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { harness, base } = require('./helpers/host.cjs');

test('spaced vault changes keep one refresh subscription and one render per event', async () => {
  const h = harness(); await h.render();
  for (let i = 0; i < 8; i++) {
    const before = h.overview.listEl.empties;
    h.overview.handleVaultChange('renamed'); await h.flush();
    assert.equal(h.overview.emitter.events['vault-change'].length, 1);
    assert.equal(h.overview.listEl.empties, before + 1);
    assert.equal(h.overview.listEl.children[0].children[0].children[0].innerText, 'item');
  }
});

test('unload cancels pending refresh and prevents further rendering', async () => {
  const h = harness(); await h.render();
  h.overview.handleVaultChange('created');
  h.children[0].unload();
  assert.equal(h.timers.size, 0);
  assert.equal(h.overview.emitter.events['vault-change'].length, 0);
  const before = h.overview.listEl.empties;
  await h.render(); await h.flush();
  assert.equal(h.overview.listEl.empties, before);
});

test('unload during asynchronous filtering cannot resume rendering or subscribe', async () => {
  const h = harness(); const rendering = h.render();
  h.children[0].unload(); await rendering;
  assert.equal(h.overview.listEl.children.length, 0);
  assert.equal(h.overview.emitter.events['vault-change']?.length ?? 0, 0);
});

test('repeated mount/unmount releases every overview', async () => {
  for (let i = 0; i < 20; i++) {
    const h = harness(); await h.render();
    h.overview.handleVaultChange('deleted'); h.children[0].unload(); await h.flush();
    assert.equal(h.timers.size, 0);
    assert.equal(h.overview.emitter.events['vault-change'].length, 0);
  }
});

test('bursts debounce and autoSync=false suppresses refresh', async () => {
  const h = harness(); await h.render(); const before = h.overview.listEl.empties;
  for (let i = 0; i < 100; i++) h.overview.handleVaultChange('created');
  assert.equal(h.timers.size, 1); await h.flush();
  assert.equal(h.overview.listEl.empties, before + 1);
  h.overview.yaml.autoSync = false; h.overview.handleVaultChange('created');
  assert.equal(h.timers.size, 0);
});

test('edit handlers stay bounded through mutations, replacement and remount', () => {
  const h = harness();
  const { OverviewBlockLifecycle } = h.load(path.join(base, 'utils/OverviewBlockLifecycle.ts'));
  const el = new h.Element(); let button = new h.Element();
  el.parentElement = { childNodes: { item: () => button } };
  let clicks = 0;
  const child = new OverviewBlockLifecycle(el, () => clicks++);
  for (let i = 0; i < 1000; i++) h.observers[0].fire();
  assert.equal(button.listeners.get('click').size, 1); button.click(); assert.equal(clicks, 1);
  const old = button; button = new h.Element(); h.observers[0].fire();
  assert.equal(old.listeners.get('click').size, 0);
  assert.equal(button.listeners.get('click').size, 1);
  const replacement = new OverviewBlockLifecycle(el, () => clicks += 10);
  assert.equal(button.listeners.get('click').size, 1);
  child.unload(); // An old context must not remove the new context's handler.
  button.click(); assert.equal(clicks, 11);
  replacement.unload();
  assert.equal(button.listeners.get('click').size, 0);
  assert.ok(h.observers.every(observer => !observer.active));
  for (let i = 0; i < 20; i++) {
    const next = new OverviewBlockLifecycle(el, () => clicks++); next.unload();
    assert.equal(button.listeners.get('click').size, 0);
  }
});

for (const entry of ['src/main.ts']) {
  test(`${entry}: closing before layout ready prevents deferred overview creation`, async () => {
    const h = harness();
    const { OverviewBlockLifecycle } = h.load(path.join(base, 'utils/OverviewBlockLifecycle.ts'));
    // Run the actual processor method, isolating the plugin's unrelated startup imports.
    const file = ts.createSourceFile(entry, fs.readFileSync(path.resolve(__dirname, '..', entry), 'utf8'), ts.ScriptTarget.Latest, true);
    const cls = file.statements.find(ts.isClassDeclaration);
    const method = cls.members.find(member => member.name?.getText(file) === 'handleOverviewBlock');
    const code = ts.transpileModule(`class Processor { ${method.getText(file)} }; Processor`, { compilerOptions: { target: ts.ScriptTarget.ES2021 } }).outputText;
    let ready; let created = 0;
    const Processor = vm.runInNewContext(code, {
      OverviewBlockLifecycle, MutationObserver: h.MutationObserver, FolderOverview: class { constructor() { created++; } },
      FolderOverviewSettings: class {}, parseYaml: () => ({}), Notice: class {}, console,
    });
    const processor = new Processor();
    processor.editButtonHandlers = new WeakMap();
    processor.settings = {}; processor.app = { workspace: { layoutReady: false, onLayoutReady(fn) { ready = fn; } } };
    const childrenBefore = h.children.length;
    await processor.handleOverviewBlock('', new h.Element(), h.ctx);
    assert.equal(h.children.length, childrenBefore + 1, 'processor registers a Markdown lifecycle child');
    h.children.at(-1).unload(); await ready();
    assert.equal(created, 0);
    assert.ok(h.observers.every(observer => !observer.active));
  });
}

test('nested folder filtering stops when the overview unloads', async () => {
  const h = harness();
  const nested = new h.folder.constructor(); nested.path = 'fixture/nested';
  nested.name = 'nested'; nested.children = h.folder.children;
  h.folder.children = [nested]; h.overview.yaml.includeTypes = ['folder', 'markdown'];
  await h.render(); // Child traversal has started but its async filtering is still pending.
  h.children[0].unload();
  const item = h.overview.listEl.children[0];
  const count = item.children.length;
  await h.settle();
  assert.equal(item.children.length, count);
});

test('initial create stops after an awaited title when unloaded', async () => {
  const h = harness(); let resume;
  h.overview.renderTitle = () => new Promise(resolve => { resume = resolve; });
  const el = new h.Element();
  const pending = h.overview.create(h.plugin, el, h.ctx);
  h.children[0].unload(); resume(); await pending;
  assert.equal(h.overview.listEl.children.length, 0);
  assert.equal(h.overview.eventListeners.length, 0);
  assert.equal(h.timers.size, 0);
});

test('unload cancels delayed link-list work as well as list refreshes', () => {
  const h = harness(); h.overview.yaml.useActualLinks = true;
  h.overview.handleLinkList([]);
  assert.equal(h.timers.size, 1);
  h.children[0].unload();
  assert.equal(h.timers.size, 0);
});

test('unload releases vault subscriptions and the parent context menu', async () => {
  const h = harness();
  for (let i = 0; i < 20; i++) {
    h.overview.registerListeners();
    assert.equal(h.vaultListeners.get('rename').size, 1);
    assert.equal(h.vaultListeners.get('create').size, 1);
    assert.equal(h.vaultListeners.get('delete').size, 1);
    h.overview.disconnectListeners();
    assert.ok([...h.vaultListeners.values()].every(listeners => listeners.size === 0));
    // Simulate the next Markdown context with a fresh overview on the same vault host.
    h.overview = Object.assign(Object.create(Object.getPrototypeOf(h.overview)), {
      plugin: h.plugin, eventListeners: [], disposed: false,
    });
  }
  const next = harness(); let resume;
  next.overview.renderTitle = () => new Promise(resolve => { resume = resolve; });
  const el = new next.Element(); const parent = new next.Element(); el.parentElement = parent;
  const creating = next.overview.create(next.plugin, el, next.ctx);
  assert.equal(parent.listeners.get('contextmenu').size, 1);
  next.children[0].unload(); resume(); await creating;
  assert.equal(parent.listeners.get('contextmenu').size, 0);
});

test('unload during an awaited file title prevents later DOM writes', async () => {
  const h = harness(); let resume;
  h.overview.yaml.fmtpIntegration = true;
  h.plugin.fmtpHandler = { getNewFileName: () => new Promise(resolve => { resume = resolve; }) };
  await h.render();
  const item = h.overview.listEl.children[0].children[0];
  const link = item.children[0];
  h.children[0].unload(); resume('formatted title'); await h.settle();
  assert.equal(link.innerText, '');
  assert.equal(item.children.length, 1);
});
