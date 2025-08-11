import {
	Plugin,
	Notice,
	parseYaml,
	debounce,
	type WorkspaceLeaf,
	type MarkdownPostProcessorContext,
} from 'obsidian';
import { FolderOverviewView, FOLDER_OVERVIEW_VIEW } from './view';
import { FolderOverview, type defaultOverviewSettings } from './FolderOverview';
import { DEFAULT_SETTINGS, SettingsTab, type defaultSettings } from './settings';
import { registerOverviewCommands } from './Commands';
import { FolderOverviewSettings } from './modals/Settings';
import FolderNotesPlugin from '../../main';
import { FrontMatterTitlePluginHandler } from './utils/FmtpHandler';
import { updateAllOverviews } from './utils/functions';
import { FvIndexDB } from './utils/IndexDB';

export default class FolderOverviewPlugin extends Plugin {
	settings: defaultSettings;
	settingsTab: SettingsTab;
	fmtpHandler: FrontMatterTitlePluginHandler;
	fvIndexDB: FvIndexDB;
	async onload(): Promise<void> {
		await this.loadSettings();
		this.settingsTab = new SettingsTab(this);
		this.addSettingTab(this.settingsTab);
		this.settingsTab.display();
		registerOverviewCommands(this);
		this.fvIndexDB = new FvIndexDB(this);

		this.app.workspace.onLayoutReady(async () => {
			this.registerView(FOLDER_OVERVIEW_VIEW, (leaf: WorkspaceLeaf) => {
				return new FolderOverviewView(leaf, this);
			});

			if (this.app.plugins.getPlugin('obsidian-front-matter-title-plugin')) {
				this.fmtpHandler = new FrontMatterTitlePluginHandler(this);
			}

			if (this.settings.globalSettings.autoUpdateLinks) {
				this.fvIndexDB.init(false);
			}
		});

		this.app.vault.on('rename', () => this.handleVaultChange());
		this.app.vault.on('create', () => this.handleVaultChange());
		this.app.vault.on('delete', () => this.handleVaultChange());

		this.registerMarkdownCodeBlockProcessor(
			'folder-overview',
			(
				source: string,
				el: HTMLElement,
				ctx: MarkdownPostProcessorContext,
			) => {
				this.handleOverviewBlock(source, el, ctx);
			},
		);
		console.log('loading Folder Overview plugin');
	}

	handleVaultChange(): void {
		const DEBOUNCE_DELAY_MS = 2000;
		if (!this.settings.globalSettings.autoUpdateLinks) return;
		debounce(() => {
			updateAllOverviews(this);
		}, DEBOUNCE_DELAY_MS, true)();
	}

	async handleOverviewBlock(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): Promise<void> {
		const observer = new MutationObserver(() => {
			const editButton = el.parentElement?.childNodes.item(1);
			if (editButton) {
				editButton.addEventListener('click', (e) => {
					e.stopImmediatePropagation();
					e.preventDefault();
					e.stopPropagation();
					new FolderOverviewSettings(
						this.app, this, parseYaml(source),
						ctx, el, this.settings.defaultOverviewSettings,
					).open();
				}, { capture: true });
			}
		});

		observer.observe(el, {
			childList: true,
			subtree: true,
		});

		try {
			this.app.workspace.onLayoutReady(async () => {
				const folderOverview = new FolderOverview(
					this, ctx, source,
					el, this.settings.defaultOverviewSettings,
				);
				await folderOverview.create(this, el, ctx);
				this.updateOverviewView(this);
			});
		} catch (e) {
			// eslint-disable-next-line max-len
			new Notice('Error creating folder overview (folder notes plugin) - check console for more details');
			console.error(e);
		}
	}

	async onunload(): Promise<void> {
		console.log('Unloading Folder Overview plugin');
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		if (!this.settings.defaultOverviewSettings) {
			this.settings.defaultOverviewSettings = {
				...DEFAULT_SETTINGS.defaultOverviewSettings,
				...(data?.defaultOverviewSettings ?? {}),
			};
		}

		if (data?.firstTimeInsertOverview === undefined) {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			this.settings.firstTimeInsertOverview = true;
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async activateOverviewView(): Promise<void> {
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

export async function updateOverviewView(
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
	newYaml?: defaultOverviewSettings,
): Promise<void> {
	const { workspace } = plugin.app;
	const leaf = workspace.getLeavesOfType(FOLDER_OVERVIEW_VIEW)[0];
	if (!leaf) return;
	const view = leaf.view as FolderOverviewView;
	if (!view) return;
	if (!view.yaml) return;
	const yaml = view.yaml.id === '' ? view.yaml : newYaml;
	view.display(
		view.contentEl, yaml ?? view.yaml,
		plugin, view.defaultSettings,
		view.display, undefined, undefined,
		view.activeFile, plugin.settingsTab,
		view.modal, 'all',
	);
}

export async function updateViewDropdown(
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
): Promise<void> {
	const { workspace } = plugin.app;
	const leaf = workspace.getLeavesOfType(FOLDER_OVERVIEW_VIEW)[0];
	if (!leaf) return;
	const view = leaf.view as FolderOverviewView;
	view.display(
		view.contentEl, view.yaml, plugin,
		view.defaultSettings, view.display,
		undefined, undefined, view.activeFile,
		plugin.settingsTab, view.modal, 'dropdown',
	);
}
