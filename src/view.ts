import {
	ItemView,
	Setting,
	type TFile,
	type WorkspaceLeaf,
	type MarkdownPostProcessorContext,
	type SettingTab,
} from 'obsidian';
import { type defaultOverviewSettings, getOverviews } from './FolderOverview';
import { createOverviewSettings } from './settings';
import FolderOverviewPlugin from './main';
export const FOLDER_OVERVIEW_VIEW = 'folder-overview-view';
import FolderNotesPlugin from '../../main';
import type { FolderOverviewSettings } from './modals/Settings';
import { parseOverviewTitle } from './utils/functions';

export class FolderOverviewView extends ItemView {
	plugin: FolderOverviewPlugin | FolderNotesPlugin;
	activeFile: TFile | null;
	overviewId: string | null;
	yaml: defaultOverviewSettings;
	defaultSettings: defaultOverviewSettings;
	contentEl: HTMLElement = this.containerEl.children[1] as HTMLElement;
	changedSection: string | null | undefined;
	modal: FolderOverviewSettings;

	constructor(leaf: WorkspaceLeaf, plugin: FolderOverviewPlugin | FolderNotesPlugin) {
		super(leaf);
		this.plugin = plugin;

		this.display = this.display.bind(this);
		if (plugin instanceof FolderOverviewPlugin) {
			this.defaultSettings = plugin.settings.defaultOverviewSettings;
		} else if (plugin instanceof FolderNotesPlugin) {
			this.defaultSettings = plugin.settings.defaultOverview;
		}

		this.registerEvent(
			this.plugin.app.workspace.on('file-open', (file) => {
				this.activeFile = file;
				this.display(
					this.contentEl, this.yaml, this.plugin,
					this.defaultSettings, this.display, undefined,
					undefined, file, undefined, undefined, 'all',
				);
			}),
		);
	}

	getViewType(): string {
		return FOLDER_OVERVIEW_VIEW;
	}

	getDisplayText(): string {
		return 'Folder Overview settings';
	}

	getIcon(): string {
		return 'settings';
	}

	async onOpen(): Promise<void> {
		this.display(
			this.contentEl, this.yaml, this.plugin,
			this.defaultSettings, this.display,
			undefined, undefined, this.activeFile,
		);
	}

	async display(
		contentEl: HTMLElement,
		yaml: defaultOverviewSettings,
		plugin: FolderOverviewPlugin | FolderNotesPlugin,
		defaultSettings: defaultOverviewSettings,
		display: CallableFunction,
		el?: HTMLElement,
		ctx?: MarkdownPostProcessorContext,
		file?: TFile | null,
		settingsTab?: SettingTab,
		modal?: FolderOverviewSettings,
		changedSection?: string | null | undefined,
	): Promise<void> {
		this.contentEl = contentEl;
		this.yaml = yaml;
		this.defaultSettings = defaultSettings;
		this.changedSection = changedSection;
		if (file) { this.activeFile = file; }
		let header = contentEl.querySelector('.fn-folder-overview-header');
		if (!header) {
			header = contentEl.createEl('h4', {
				cls: 'fn-folder-overview-header',
				text: 'Folder Overview settings',
			});
		}

		const activeFile = plugin.app.workspace.getActiveFile();

		const overviews = await getOverviews(plugin, activeFile);

		let settingsContainer = contentEl.querySelector('.fn-settings-container') as HTMLElement;
		if (!settingsContainer) {
			settingsContainer = contentEl.createDiv({ cls: 'fn-settings-container' });
		}

		let dropdown = settingsContainer.querySelector('.fn-select-overview-setting');
		if (!dropdown || changedSection === 'all' || changedSection === 'dropdown') {
			if (dropdown) { settingsContainer.empty(); }
			dropdown = settingsContainer.createDiv({ cls: 'fn-select-overview-setting' });

			const overviewSetting = new Setting(dropdown as HTMLElement);
			overviewSetting
				.setName('Select overview')
				.setClass('fn-select-overview-setting')
				.addDropdown((cb) => {
					if (activeFile) {
						const titleCounts: Record<string, number> = {};

						const options = overviews.reduce((acc, overview) => {
							const title = parseOverviewTitle(
								overview, plugin, activeFile.parent, activeFile.parent?.path || '',
								activeFile,
							);

							const count = (titleCounts[title] || 0) + 1;
							titleCounts[title] = count;

							acc[overview.id] = count > 1 ? `${title} (${count})` : title;
							return acc;
						}, {} as Record<string, string>);
						cb.addOptions(options);
					}

					cb.addOption('default', 'Default');
					cb.setValue(yaml?.id ?? 'default');
					const isDefault = cb.getValue() === 'default';
					const isYamlIdEmpty = !yaml?.id.trim();
					const isCbValueEmpty = cb.getValue().trim() === '';
					if (isDefault || isYamlIdEmpty || isCbValueEmpty) {
						yaml = defaultSettings;
						cb.setValue('default');
					} else {
						const foundOverview = overviews.find(
							(overview) => overview.id === yaml.id,
						) as defaultOverviewSettings;
						yaml = foundOverview;
					}

					cb.onChange(async (value) => {
						if (value === 'default') {
							yaml = defaultSettings;
						} else {
							const foundOverview = overviews.find(
								(overview) => overview.id === value,
							) as defaultOverviewSettings;
							yaml = foundOverview;
						}
						await display(
							contentEl, yaml, plugin, defaultSettings,
							display, undefined, undefined,
							activeFile, undefined, undefined, 'all',
						);
					});
				});
		}

		this.yaml = yaml;
		await createOverviewSettings(
			settingsContainer, yaml, plugin,
			defaultSettings, display, undefined,
			undefined, activeFile, undefined,
			undefined, changedSection,
		);
	}
}
