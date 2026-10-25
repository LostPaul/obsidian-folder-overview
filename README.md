# Folder overview for [Obsidian](https://obsidian.md/)

This plugin provides a dynamic overview of your vault or folders in the format of a code block.

Support the development of the plugin

<a href='https://ko-fi.com/D1D1GHGSI' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi2.png?v=3' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

## Documentation
The documentation of the plugin can be found here: https://lostpaul.github.io/obsidian-folder-notes/Folder%20overview/

## Folder notes plugin relation
**It can't be used when the folder notes plugin is also enabled. If you already have the folder notes plugin installed you don't need to also install the folder overview plugin.**

This plugin offers the same functionality as the folder overview feature in the Folder Notes plugin. However, it is not intended to replace that feature. Instead, it serves as a standalone alternative for users who only need the folder overview functionality without the additional features of the Folder Notes plugin.

## Showcase
![nJniGLbrXrM49IeChreq](https://github.com/user-attachments/assets/f86b9f92-8a72-41b6-8936-266527b94971)

## Discord server
[For regular updates on Folder overview and my other plugins, join the Discord server to get notified and participate in discussions.](https://discord.gg/4UQEDfQmuH)

## Lifecycle regression tests

Run `npm ci` and `npm test` in this repository. The tests execute the TypeScript
list renderer and Markdown block lifecycle against a synthetic Obsidian host,
with deterministic timers and no vault access. `npm run repro` prints the active
refresh subscription count after eight spaced notifications. It should remain
`[1,1,1,1,1,1,1,1,1]`, rather than the previous `[1,2,4,8,16,32,64,128,256]`.

The production entry point is built from the Folder Notes repository, which
provides the shared imports. With this revision checked out as its overview
submodule, run `npm ci`, `npm run fn-build`, and `npm run fv-build` there.
