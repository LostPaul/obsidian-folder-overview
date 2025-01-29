import { Plugin, WorkspaceLeaf, Notice, MarkdownPostProcessorContext, parseYaml } from 'obsidian';
import { FolderOverviewView, FOLDER_OVERVIEW_VIEW } from './view';
import { overviewSettings, FolderOverview } from './FolderOverview';
import { DEFAULT_SETTINGS, SettingsTab } from './settings';
import { registerOverviewCommands } from './Commands';
import { FolderOverviewSettings } from './modals/Settings';
import FolderNotesPlugin from '../../main';
import { FolderNotesSettings } from '../../settings/SettingsTab';

export default class FolderOverviewPlugin extends Plugin {
	settings: overviewSettings;
	settingsTab: SettingsTab;
	async onload() {
		await this.loadSettings();
		this.settingsTab = new SettingsTab(this);
		this.addSettingTab(this.settingsTab);
		this.settingsTab.display();
		registerOverviewCommands(this);

		if (this.app.workspace.layoutReady) {
			this.registerView(FOLDER_OVERVIEW_VIEW, (leaf: WorkspaceLeaf) => {
				return new FolderOverviewView(leaf, this);
			});
		} else {
			this.app.workspace.onLayoutReady(async () => {
				this.registerView(FOLDER_OVERVIEW_VIEW, (leaf: WorkspaceLeaf) => {
					return new FolderOverviewView(leaf, this);
				});
			});
		}

		this.registerMarkdownCodeBlockProcessor('folder-overview', (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			this.handleOverviewBlock(source, el, ctx);
		});
		console.log('loading Folder Overview plugin');
	}

	async handleOverviewBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const observer = new MutationObserver(() => {
			const editButton = el.parentElement?.childNodes.item(1);
			if (editButton) {
				editButton.addEventListener('click', (e) => {
					e.stopImmediatePropagation();
					e.preventDefault();
					e.stopPropagation();
					new FolderOverviewSettings(this.app, this, parseYaml(source), ctx, el, this.settings).open();
				}, { capture: true });
			}
		});

		observer.observe(el, {
			childList: true,
			subtree: true,
		});

		try {
			this.app.workspace.onLayoutReady(async () => {
				const folderOverview = new FolderOverview(this, ctx, source, el, this.settings);
				await folderOverview.create(this, parseYaml(source), el, ctx);
				this.updateOverviewView(this);
			});
		} catch (e) {
			new Notice('Error creating folder overview (folder notes plugin) - check console for more details');
			console.error(e);
		}
	}

	async onunload() {
		console.log('unloading Folder Overview plugin');
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateOverviewView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(FOLDER_OVERVIEW_VIEW);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: FOLDER_OVERVIEW_VIEW, active: true });
		}

		if (!leaf) return;
		workspace.revealLeaf(leaf);
	}

	updateOverviewView = updateOverviewView;
	updateViewDropdown = updateViewDropdown;
}

export async function updateOverviewView(plugin: FolderOverviewPlugin | FolderNotesPlugin, newYaml?: overviewSettings) {
	const { workspace } = plugin.app;
	const leaf = workspace.getLeavesOfType(FOLDER_OVERVIEW_VIEW)[0];
	if (!leaf) return;
	const view = leaf.view as any as FolderOverviewView;
	if (!view) return;
	if (!view.yaml) return;
	const yaml = view.yaml.id === '' ?  view.yaml : newYaml;
	view.display(view.contentEl, yaml ?? view.yaml, plugin, view.defaultSettings, view.display, undefined, undefined, view.activeFile, plugin.settingsTab, view.modal, 'all');
}

export async function updateViewDropdown(plugin: FolderOverviewPlugin | FolderNotesPlugin) {
	const { workspace } = plugin.app;
	const leaf = workspace.getLeavesOfType(FOLDER_OVERVIEW_VIEW)[0];
	if (!leaf) return;
	const view = leaf.view as any as FolderOverviewView;
	view.display(view.contentEl, view.yaml, plugin, view.defaultSettings, view.display, undefined, undefined, view.activeFile, plugin.settingsTab, view.modal, 'dropdown');
}