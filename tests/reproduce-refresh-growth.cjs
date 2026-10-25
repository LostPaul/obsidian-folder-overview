const { harness } = require('./helpers/host.cjs');

(async () => {
  const h = harness(process.argv[2]);
  await h.render();
  const subscriptions = [h.overview.emitter.events['vault-change'].length];
  for (let i = 0; i < 8; i++) {
    h.overview.handleVaultChange('renamed');
    await h.flush();
    subscriptions.push(h.overview.emitter.events['vault-change'].length);
  }
  console.log(JSON.stringify({ spacedNotifications: 8, subscriptions }));
  h.children[0].unload();
})().catch(error => { console.error(error); process.exitCode = 1; });
