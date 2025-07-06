import { MarkdownPostProcessorContext, normalizePath, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';
import { updateYaml, updateYamlById, overviewSettings, includeTypes } from './FolderOverview';
import { FolderSuggest } from './suggesters/FolderSuggester';
import { ListComponent } from './utils/ListComponent';
import { FolderOverviewSettings } from './modals/Settings';
import FolderOverviewPlugin from './main';
import FolderNotesPlugin from '../../main';




export const DEFAULT_SETTINGS: overviewSettings = {
	id: '',
	folderPath: '',
	title: '{{folderName}} overview',
	showTitle: false,
	depth: 3,
	includeTypes: ['folder', 'markdown'],
	style: 'list',
	disableFileTag: false,
	sortBy: 'name',
	sortByAsc: true,
	showEmptyFolders: false,
	onlyIncludeSubfolders: false,
	storeFolderCondition: true,
	showFolderNotes: false,
	disableCollapseIcon: true,
	alwaysCollapse: false,
	autoSync: true,
	allowDragAndDrop: true,
	hideLinkList: true,
	hideFolderOverview: false,
	useActualLinks: false,
	fmtpIntegration: false,
};

export class SettingsTab extends PluginSettingTab {
	plugin: FolderOverviewPlugin;

	constructor(plugin: FolderOverviewPlugin) {
		super(plugin.app, plugin);
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('p', { text: 'Edit the default settings of folder overviews', cls: 'setting-item-description' });

		this.display = this.display.bind(this);

		createOverviewSettings(containerEl, this.plugin.settings, this.plugin, this.plugin.settings, this.display, undefined, undefined, undefined, this);
	}
}

const createOrReplaceSetting = (
	container: HTMLElement,
	section: string,
	changedSection: string | null,
	renderSetting: (el: HTMLElement) => void
) => {
	let sectionContainer = container.querySelector(`.setting-${section}`);
	if (sectionContainer) {
		if (changedSection === section || changedSection === 'all') {
			sectionContainer.empty();
			renderSetting(sectionContainer as HTMLElement);
			return;
		} else {
			return;
		}
	}

	sectionContainer = container.createDiv({ cls: `setting-${section} overview-setting-item-fv` });
	renderSetting(sectionContainer as HTMLElement);
};


export async function createOverviewSettings(contentEl: HTMLElement, yaml: overviewSettings, plugin: FolderOverviewPlugin | FolderNotesPlugin, defaultSettings: overviewSettings, display: CallableFunction, el?: HTMLElement, ctx?: MarkdownPostProcessorContext, file?: TFile | null, settingsTab?: PluginSettingTab, modal?: FolderOverviewSettings, changedSection?: string | null) {
	changedSection = changedSection ?? null;

	createOrReplaceSetting(contentEl, 'auto-sync', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('Auto sync')
			.setDesc('Choose if the overview should automatically update when you delete, create or rename a file/folder')
			.addToggle((toggle) =>
				toggle
					.setValue(yaml.autoSync)
					.onChange(async (value) => {
						yaml.autoSync = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
						refresh(contentEl, yaml, plugin, defaultSettings, display, el, ctx, file, settingsTab, modal);
					})
			);
	});

	createOrReplaceSetting(contentEl, 'allow-drag-and-drop', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('Allow drag and drop')
			.setDesc('Choose if you want to allow drag and drop in the overview')
			.addToggle((toggle) =>
				toggle
					.setValue(yaml.allowDragAndDrop)
					.onChange(async (value) => {
						yaml.allowDragAndDrop = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
						refresh(contentEl, yaml, plugin, defaultSettings, display, el, ctx, file, settingsTab, modal);
					})
			);
	});

	createOrReplaceSetting(contentEl, 'showTitle', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('Show the title')
			.setDesc('Choose if the title above the folder overview should be shown')
			.addToggle((toggle) =>
				toggle
					.setValue(yaml.showTitle)
					.onChange(async (value) => {
						yaml.showTitle = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
						refresh(contentEl, yaml, plugin, defaultSettings, display, el, ctx, file, settingsTab, modal);
					})
			);
	});

	createOrReplaceSetting(contentEl, 'title-container-fn', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('Title')
			.setDesc(
				createFragment((frag) => {
					const link = frag.createEl('a', {
						text: 'Find more information about the title in the documentation. There is also a list of variables you can use',
						href: 'https://lostpaul.github.io/obsidian-folder-notes/Folder%20overview/#title',
					});
					link.target = '_blank';
				})
			)
			.addText((text) =>
				text
					.setValue(yaml?.title || '{{folderName}} overview')
					.onChange(async (value) => {
						yaml.title = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
					})
			);
	});

	createOrReplaceSetting(contentEl, 'folder-path', changedSection, (settingEl) => {
		const folderPathSetting = new Setting(settingEl)
			.setName('Folder path for the overview')
			.setDesc(
				createFragment((frag) => {
					frag.appendText('The overview will show the subfolders and files of the folder you choose here. ');
					const link = frag.createEl('a', {
						text: 'Find more information about this setting in the documentation.',
						href: 'https://lostpaul.github.io/obsidian-folder-notes/Folder%20overview/#folder-path',
					});
					link.target = '_blank';
				})
			)
			.addSearch((search) => {
				new FolderSuggest(search.inputEl, plugin, false);
				search
					.setPlaceholder('Folder path')
					.setValue(yaml?.folderPath || '')
					.onChange(async (value) => {
						const whiteList = ['File’s parent folder path', 'Path of folder linked to the file'];
						if (value.trim() !== '' && !whiteList.includes(value.trim())) {
							value = normalizePath(value);
						}
						if (!whiteList.includes(value.trim())) {
							if (!(plugin.app.vault.getAbstractFileByPath(value) instanceof TFolder) && value !== '') return;
						}
						yaml.folderPath = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
					});
			});
		folderPathSetting.settingEl.classList.add('fn-overview-folder-path');
	});

	createOrReplaceSetting(contentEl, 'use-actual-links', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('Use actual links')
			.setDesc('Choose if the links in the overview should be showed in the graph view. This requires a second list under the actual overview and which is hidden by default.')
			.addToggle((toggle) =>
				toggle
					.setValue(yaml.useActualLinks)
					.onChange(async (value) => {
						yaml.useActualLinks = value;
						updateSettings(contentEl, yaml, plugin, yaml.useActualLinks, defaultSettings, el, ctx, file);
						refresh(contentEl, yaml, plugin, defaultSettings, display, el, ctx, file, settingsTab, modal);
					})
			);
	});

	createOrReplaceSetting(contentEl, 'hide-folder-overview', changedSection, (settingEl) => {
		const hideOverviewSeting = new Setting(settingEl)
			.setName('Hide folder overview')
			.setDesc('Choose if the folder overview should be hidden and instead only the link list should be shown')
			.addToggle((toggle) =>
				toggle
					.setValue(yaml.hideFolderOverview)
					.onChange(async (value) => {
						yaml.hideFolderOverview = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
						refresh(contentEl, yaml, plugin, defaultSettings, display, el, ctx, file, settingsTab, modal);
					})
			);
		hideOverviewSeting.settingEl.classList.add('fn-hide-overview-setting');
	});

	createOrReplaceSetting(contentEl, 'hide-link-list', changedSection, (settingEl) => {
		const hideLinkListSetting = new Setting(settingEl)
			.setName('Hide link list')
			.setDesc('Choose if only link list under the folder overview should be shown')
			.addToggle((toggle) =>
				toggle
					.setValue(yaml.hideLinkList)
					.onChange(async (value) => {
						yaml.hideLinkList = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
						refresh(contentEl, yaml, plugin, defaultSettings, display, el, ctx, file, settingsTab, modal);
					})
			);
		hideLinkListSetting.settingEl.classList.add('fn-hide-link-list-setting');
	});

	createOrReplaceSetting(contentEl, 'overview-style', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('Overview style')
			.setDesc('Choose the style of the overview (grid style soon)')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('list', 'List')
					.addOption('explorer', 'Explorer')
					.setValue(yaml?.style || 'list')
					.onChange(async (value: 'list') => {
						yaml.style = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
						refresh(contentEl, yaml, plugin, defaultSettings, display, el, ctx, file, settingsTab, modal);
					})
			);
	});

	createOrReplaceSetting(contentEl, 'include-types', changedSection, (settingEl) => {
		const setting = new Setting(settingEl);
		setting.setName('Include types');
		const list = new ListComponent(setting.settingEl, yaml.includeTypes || [], ['markdown', 'folder']);
		list.on('update', (values) => {
			yaml.includeTypes = values;
			updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
			refresh(contentEl, yaml, plugin, defaultSettings, display, el, ctx, file, settingsTab, modal, 'include-types');
		});

		if ((yaml?.includeTypes?.length || 0) < 8 && !yaml.includeTypes?.includes('all')) {
			setting.addDropdown((dropdown) => {
				if (!yaml.includeTypes) yaml.includeTypes = (plugin instanceof FolderNotesPlugin) ? plugin.settings.defaultOverview.includeTypes : plugin.settings.includeTypes || [];
				yaml.includeTypes = yaml.includeTypes.map((type: string) => type.toLowerCase()) as includeTypes[];
				const options = [
					{ value: 'markdown', label: 'Markdown' },
					{ value: 'folder', label: 'Folder' },
					{ value: 'canvas', label: 'Canvas' },
					{ value: 'pdf', label: 'PDF' },
					{ value: 'image', label: 'Image' },
					{ value: 'audio', label: 'Audio' },
					{ value: 'video', label: 'Video' },
					{ value: 'other', label: 'All other file types' },
					{ value: 'all', label: 'All file types' },
				];

				options.forEach((option) => {
					if (!yaml.includeTypes?.includes(option.value as includeTypes)) {
						dropdown.addOption(option.value, option.label);
					}
				});
				dropdown.addOption('+', '+');
				dropdown.setValue('+');
				dropdown.onChange(async (value) => {
					if (value === 'all') {
						yaml.includeTypes = yaml.includeTypes?.filter((type: string) => type === 'folder');
						list.setValues(yaml.includeTypes);
					}
					await list.addValue(value.toLowerCase());
					updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
					refresh(contentEl, yaml, plugin, defaultSettings, display, el, ctx, file, settingsTab, modal, 'include-types');
				});
			});
		}
	});

	createOrReplaceSetting(contentEl, 'file-tag', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('Disable file tag')
			.setDesc('Choose if the file tag should be shown after the file name')
			.addToggle((toggle) => {
				toggle
					.setValue(yaml.disableFileTag)
					.onChange(async (value) => {
						yaml.disableFileTag = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
					});
			});
	});

	createOrReplaceSetting(contentEl, 'show-folder-notes', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('Show folder notes')
			.setDesc('Choose if folder notes (the note itself and not the folder name) should be shown in the overview')
			.addToggle((toggle) =>
				toggle
					.setValue(yaml.showFolderNotes)
					.onChange(async (value) => {
						yaml.showFolderNotes = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
					})
			);
	});

	createOrReplaceSetting(contentEl, 'file-depth', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('File depth')
			.setDesc('File & folder = +1 depth')
			.addSlider((slider) =>
				slider
					.setValue(yaml?.depth || 2)
					.setLimits(1, 10, 1)
					.setDynamicTooltip()
					.onChange(async (value) => {
						yaml.depth = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
					})
			);
	});

	createOrReplaceSetting(contentEl, 'sort-files', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('Sort files by')
			.setDesc('Choose how the files should be sorted')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('name', 'Name')
					.addOption('created', 'Created')
					.addOption('modified', 'Modified')
					.setValue(yaml?.sortBy || 'name')
					.onChange(async (value: 'name' | 'created' | 'modified') => {
						yaml.sortBy = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
					})
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption('desc', 'Descending')
					.addOption('asc', 'Ascending');
				if (yaml.sortByAsc) {
					dropdown.setValue('asc');
				} else {
					dropdown.setValue('desc');
				}
				dropdown.onChange(async (value) => {
					yaml.sortByAsc = value === 'asc';
					updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
				});
			});
	});

	createOrReplaceSetting(contentEl, 'show-empty-folders', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('Show folder names of folders that appear empty in the folder overview')
			.setDesc('Show the names of folders that appear to have no files/folders in the folder overview. That\'s mostly the case when you set the file depth to 1.')
			.addToggle((toggle) => {
				toggle
					.setValue(yaml.showEmptyFolders)
					.onChange(async (value) => {
						yaml.showEmptyFolders = value;
						yaml.onlyIncludeSubfolders = false;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
						refresh(contentEl, yaml, plugin, defaultSettings, display, el, ctx, file, settingsTab, modal);
					});
			});
	});

	createOrReplaceSetting(contentEl, 'show-empty-folders-only-first-level', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('Only show empty folders which are on the first level of the folder overview')
			.addToggle((toggle) => {
				toggle
					.setValue(yaml.onlyIncludeSubfolders)
					.onChange(async (value) => {
						yaml.onlyIncludeSubfolders = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
					});
			});
	});

	createOrReplaceSetting(contentEl, 'disable-collapse-icon', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('Disable collapse icon for folder notes')
			.setDesc('Remove the collapse icon next to the folder name for folder notes when they only contain the folder note itself')
			.addToggle((toggle) => {
				toggle
					.setValue(yaml.disableCollapseIcon)
					.onChange(async (value) => {
						yaml.disableCollapseIcon = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
					});
			});
	});

	createOrReplaceSetting(contentEl, 'store-collapse-condition', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('Store collapsed condition')
			.setDesc('Choose if the collapsed condition should be stored until you restart Obsidian')
			.addToggle((toggle) =>
				toggle
					.setValue(yaml.storeFolderCondition)
					.onChange(async (value) => {
						yaml.storeFolderCondition = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
					})
			);
	});

	createOrReplaceSetting(contentEl, 'collapse-all-by-default', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('Collapse all in the tree by default')
			.setDesc('Collapse every folder in the file explorer in the overview by default')
			.addToggle((toggle) => {
				toggle
					.setValue(yaml.alwaysCollapse)
					.onChange(async (value) => {
						yaml.alwaysCollapse = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
					});
			});
	});

	createOrReplaceSetting(contentEl, 'fmtp-integration', changedSection, (settingEl) => {
		new Setting(settingEl)
			.setName('Front Matter Title Plugin integration')
			.setDesc('Replace the folder/file name with the title from the Front Matter Title Plugin. This requires the plugin to be installed and enabled.')
			.addToggle((toggle) =>
				toggle
					.setValue(yaml.fmtpIntegration)
					.onChange(async (value) => {
						yaml.fmtpIntegration = value;
						updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
					})
			);
	});

	updateSettings(contentEl, yaml, plugin, false, defaultSettings, el, ctx, file);
}

async function updateSettings(contentEl: HTMLElement, yaml: overviewSettings, plugin: FolderOverviewPlugin | FolderNotesPlugin, addLinkList: boolean, defaultSettings: overviewSettings, el?: HTMLElement, ctx?: MarkdownPostProcessorContext, file?: TFile | null) {
	let showDisableFileTag = false;
	yaml.includeTypes?.forEach((type: string) => {
		if (type !== 'markdown' && type !== 'folder') {
			showDisableFileTag = true;
		}
	});
	if (yaml.includeTypes.length === 0) {
		showDisableFileTag = false;
	}

	toggleSections(contentEl, {
		'setting-title-container-fn': yaml.showTitle,
		'setting-store-collapse-condition': yaml.style === 'explorer',
		'setting-file-tag': showDisableFileTag,
		'setting-show-empty-folders': yaml.style === 'list',
		'setting-show-empty-folders-only-first-level': yaml.showEmptyFolders && yaml.style === 'list',
		'setting-disable-collapse-icon': yaml.style === 'explorer',
		'setting-collapse-all-by-default': yaml.style === 'explorer',
		'setting-allow-drag-and-drop': yaml.style === 'explorer',
		'setting-hide-folder-overview': !yaml.hideLinkList && yaml.useActualLinks,
		'setting-hide-link-list': !yaml.hideFolderOverview && yaml.useActualLinks,
		'setting-fmtp-integration': !!plugin.app.plugins.getPlugin('obsidian-front-matter-title-plugin'),
	});
	if (!yaml.id) {
		plugin.saveSettings();
		if (file === undefined) {
			plugin.updateOverviewView(plugin);
		}
		return;
	}

	if (el && ctx) {
		await updateYaml(plugin, ctx, el, yaml, addLinkList);
	}

	if (file) {
		await updateYamlById(plugin, yaml.id, file, yaml, addLinkList);
	}
}

function refresh(contentEl: HTMLElement, yaml: overviewSettings, plugin: FolderOverviewPlugin | FolderNotesPlugin, defaultSettings: overviewSettings, display: CallableFunction, el?: HTMLElement, ctx?: MarkdownPostProcessorContext, file?: TFile | null, settingsTab?: PluginSettingTab, modal?: FolderOverviewSettings, changedSection?: string) {
	if (file) {
		contentEl = contentEl.parentElement as HTMLElement;
	}
	display(contentEl, yaml, plugin, defaultSettings, display, el, ctx, file, settingsTab, modal, changedSection);

}

function toggleSections(contentEl: HTMLElement, sections: Record<string, boolean>) {
	Object.entries(sections).forEach(([sectionClass, shouldShow]) => {
		const sections = contentEl.querySelectorAll(`.${sectionClass}`);
		sections.forEach((section) => {
			if (shouldShow && section) {
				section.classList.remove('hide');
			} else {
				section?.classList.add('hide');
			}
		});
	});
}
