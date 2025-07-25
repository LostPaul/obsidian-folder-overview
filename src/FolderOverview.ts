import { MarkdownPostProcessorContext, parseYaml, TAbstractFile, TFolder, TFile, stringifyYaml, Notice, Menu, MarkdownRenderChild, App } from 'obsidian';
import { FolderOverviewSettings } from './modals/Settings';
import { getExcludedFolder } from '../../ExcludeFolders/functions/folderFunctions';
import { getFolderPathFromString } from '../../functions/utils';
import { FileExplorerOverview } from './styles/FileExplorer';
import { renderListOverview } from './styles/List';
import NewFolderNameModal from '../../modals/NewFolderName';
import { CustomEventEmitter } from './utils/EventEmitter';
import FolderOverviewPlugin from './main';
import FolderNotesPlugin from '../../main';
import { getFolder, getFolderNote } from '../../functions/folderNoteFunctions';

export type includeTypes = 'folder' | 'markdown' | 'canvas' | 'other' | 'pdf' | 'image' | 'audio' | 'video' | 'all';

export type defaultOverviewSettings = {
	id: string;
	folderPath: string;
	title: string;
	showTitle: boolean;
	depth: number;
	includeTypes: includeTypes[];
	style: 'list' | 'grid' | 'explorer';
	disableFileTag: boolean;
	sortBy: 'name' | 'created' | 'modified';
	sortByAsc: boolean;
	showEmptyFolders: boolean;
	onlyIncludeSubfolders: boolean;
	storeFolderCondition: boolean;
	showFolderNotes: boolean;
	disableCollapseIcon: boolean;
	alwaysCollapse: boolean;
	autoSync: boolean;
	allowDragAndDrop: boolean;
	hideLinkList: boolean;
	hideFolderOverview: boolean;
	useActualLinks: boolean;
	fmtpIntegration: boolean;
	titleSize: number;
	isInCallout: boolean;
};

export class FolderOverview {
	emitter: CustomEventEmitter;
	yaml: defaultOverviewSettings;
	plugin: FolderOverviewPlugin | FolderNotesPlugin;
	ctx: MarkdownPostProcessorContext;
	source: string;
	folderName: string | null;
	el: HTMLElement;
	pathBlacklist: string[] = [];
	folders: TFolder[] = [];
	sourceFilePath: string;
	sourceFolder: TFolder | undefined | null;
	root: HTMLElement;
	listEl: HTMLUListElement;
	defaultSettings: defaultOverviewSettings;
	sourceFile: TFile;
	counter = 0;

	eventListeners: (() => void)[] = [];
	constructor(plugin: FolderNotesPlugin | FolderOverviewPlugin, ctx: MarkdownPostProcessorContext, source: string, el: HTMLElement, defaultSettings: defaultOverviewSettings) {
		this.plugin = plugin;
		this.emitter = new CustomEventEmitter();
		let yaml: defaultOverviewSettings = parseYaml(source);
		if (!yaml) { yaml = {} as defaultOverviewSettings; }
		const includeTypes = yaml?.includeTypes || defaultSettings.includeTypes || ['folder', 'markdown'];
		this.ctx = ctx;
		this.source = source;
		this.el = el;
		this.sourceFilePath = this.ctx.sourcePath;
		const sourceFile = this.plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (sourceFile instanceof TFile) {
			this.sourceFile = sourceFile;
		}

		switch (yaml?.folderPath.trim()) {
			case 'File’s parent folder path': {
				const sourceFolder = this.plugin.app.vault.getAbstractFileByPath(getFolderPathFromString(ctx.sourcePath));
				if (sourceFolder instanceof TFolder) {
					yaml.folderPath = sourceFolder.path;
					this.sourceFolder = sourceFolder;
				}
				break;
			}
			case 'Path of folder linked to the file': {
				if (plugin instanceof FolderNotesPlugin && this.sourceFile instanceof TFile) {
					const folderNoteFolder = getFolder(plugin, this.sourceFile);
					if (folderNoteFolder instanceof TFolder) {
						this.sourceFolder = folderNoteFolder;
						yaml.folderPath = folderNoteFolder.path;
					} else {
						yaml.folderPath = '';
					}
				}
				break;
			}
			case '': {
				const sourceFolder = this.plugin.app.vault.getAbstractFileByPath(getFolderPathFromString(ctx.sourcePath));
				if (sourceFolder instanceof TFolder) {
					yaml.folderPath = sourceFolder.path;
					this.sourceFolder = sourceFolder;
				}
				break;
			}
			default: {
				const sourceFolder = this.plugin.app.vault.getAbstractFileByPath(yaml.folderPath.trim());
				if (sourceFolder instanceof TFolder) {
					yaml.folderPath = sourceFolder.path;
					this.sourceFolder = sourceFolder;
				}
				break;
			}
		}

		this.defaultSettings = defaultSettings;
		this.yaml = {
			id: yaml?.id ?? crypto.randomUUID(),
			folderPath: yaml?.folderPath.trim() ?? getFolderPathFromString(ctx.sourcePath),
			title: yaml?.title ?? defaultSettings.title,
			showTitle: yaml?.showTitle ?? defaultSettings.showTitle,
			depth: yaml?.depth ?? defaultSettings.depth,
			style: yaml?.style ?? 'list',
			includeTypes: includeTypes.map((type) => type.toLowerCase()) as includeTypes[],
			disableFileTag: yaml?.disableFileTag ?? defaultSettings.disableFileTag,
			sortBy: yaml?.sortBy ?? defaultSettings.sortBy,
			sortByAsc: yaml?.sortByAsc ?? defaultSettings.sortByAsc,
			showEmptyFolders: yaml?.showEmptyFolders ?? defaultSettings.showEmptyFolders,
			onlyIncludeSubfolders: yaml?.onlyIncludeSubfolders ?? defaultSettings.onlyIncludeSubfolders,
			storeFolderCondition: yaml?.storeFolderCondition ?? defaultSettings.storeFolderCondition,
			showFolderNotes: yaml?.showFolderNotes ?? defaultSettings.showFolderNotes,
			disableCollapseIcon: yaml?.disableCollapseIcon ?? defaultSettings.disableCollapseIcon,
			alwaysCollapse: yaml?.alwaysCollapse ?? defaultSettings.alwaysCollapse,
			autoSync: yaml?.autoSync ?? defaultSettings.autoSync,
			allowDragAndDrop: yaml?.allowDragAndDrop ?? defaultSettings.allowDragAndDrop,
			hideLinkList: yaml?.hideLinkList ?? defaultSettings.hideLinkList,
			hideFolderOverview: yaml?.hideFolderOverview ?? defaultSettings.hideFolderOverview,
			useActualLinks: yaml?.useActualLinks ?? defaultSettings.useActualLinks,
			fmtpIntegration: yaml?.fmtpIntegration ?? defaultSettings.fmtpIntegration,
			titleSize: yaml?.titleSize ?? defaultSettings.titleSize,
			isInCallout: yaml?.isInCallout ?? false,
		};

		const customChild = new CustomMarkdownRenderChild(el, this);
		ctx.addChild(customChild);
	}

	on(event: string, listener: (data?: any) => void) {
		this.emitter.on(event, listener);
	}

	off(event: string, listener: (data?: any) => void) {
		this.emitter.off(event, listener);
	}

	private emit(event: string, data?: any) {
		this.emitter.emit(event, data);
	}

	handleVaultChange(eventType: string) {
		if (this.yaml.autoSync) {
			this.emit('vault-change', eventType);
		}
	}

	disconnectListeners() {
		this.eventListeners.forEach((unregister) => unregister());
		this.eventListeners = [];
	}

	registerListeners() {
		const plugin = this.plugin;
		const handleRename = () => this.handleVaultChange('renamed');
		const handleCreate = () => this.handleVaultChange('created');
		const handleDelete = () => this.handleVaultChange('deleted');

		plugin.app.vault.on('rename', handleRename);
		plugin.app.vault.on('create', handleCreate);
		plugin.app.vault.on('delete', handleDelete);

		this.eventListeners.push(() => plugin.app.vault.off('rename', handleRename));
		this.eventListeners.push(() => plugin.app.vault.off('create', handleCreate));
		this.eventListeners.push(() => plugin.app.vault.off('delete', handleDelete));
	}

	async create(plugin: FolderOverviewPlugin | FolderNotesPlugin, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		el.empty();
		el.parentElement?.classList.add('folder-overview-container');
		if (this.yaml.hideFolderOverview) {
			if (this.yaml.isInCallout) {
				el?.classList.add('fv-hide-overview');
			} else {
				el.parentElement?.classList.add('fv-hide-overview');
			}
		}

		el.parentElement?.addEventListener('contextmenu', (e) => {
			this.editOverviewContextMenu(e);
		}, { capture: true });

		const root = el.createEl('div', { cls: 'folder-overview' });
		this.root = root;

		const headingTag = `h${this.yaml.titleSize}` as keyof HTMLElementTagNameMap;
		const titleEl = root.createEl(headingTag, { cls: 'folder-overview-title' });

		const ul = root.createEl('ul', { cls: 'folder-overview-list' });
		this.listEl = ul;

		if (this.yaml.includeTypes.length === 0) { return this.addEditButton(root); }
		let files: TAbstractFile[] = [];

		const sourceFile = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
		if (!(sourceFile instanceof TFile)) return;

		let sourceFolderPath = this.yaml.folderPath.trim() || getFolderPathFromString(ctx.sourcePath);
		if (!sourceFolderPath) {
			sourceFolderPath = '/';
		}

		this.registerListeners();

		const sourceFolder = this.sourceFolder;

		if (this.yaml.showTitle) {
			const variables: Record<string, string> = {
				'folderName': sourceFolder?.path === '/' || sourceFolderPath === '/' ? 'Vault' : sourceFolder?.name ?? '',
				'folderPath': sourceFolder?.path ?? sourceFolderPath ?? '',
				'filePath': sourceFile.path,
				'fileName': sourceFile instanceof TFile ? sourceFile.basename : '',
				'fmtpFileName': await this.plugin.fmtpHandler?.getNewFileName(sourceFile) ?? '',
			};

			const fileCache = this.plugin.app.metadataCache.getFileCache(sourceFile);
			const frontmatter = fileCache?.frontmatter ?? {};
			const propertyRegex = /\{\{properties\.([\w-]+)\}\}/g;

			let title = this.yaml.title;

			// Replace properties.<name>
			title = title.replace(propertyRegex, (_, prop) => {
				const value = frontmatter[prop];
				return value !== undefined ? String(value) : '';
			});

			// Replace other variables
			title = title.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '');

			titleEl.innerText = title;
		}

		if (!sourceFolder && (sourceFolderPath !== '/' && sourceFolderPath !== '')) { return new Notice('Folder overview: Couldn\'t find the folder'); }
		if (!sourceFolder && sourceFolderPath === '') {
			sourceFolderPath = '/';
		}
		if (!(sourceFolder instanceof TFolder) && sourceFolderPath !== '/') { return; }

		if (sourceFolder?.path === '/') {
			const rootFiles: TAbstractFile[] = [];
			plugin.app.vault.getAllLoadedFiles().filter((f) => f.parent?.path === '/').forEach((file) => {
				if (!file.path.includes('/')) {
					rootFiles.push(file);
				}
			});
			files = rootFiles;
		} else if (sourceFolder instanceof TFolder) {
			files = sourceFolder.children;
		}

		files = (await filterFiles(files, plugin, sourceFolderPath, this.yaml.depth, this.pathBlacklist, this.yaml, this.sourceFile)).filter((file): file is TAbstractFile => file !== null);
		if (!this.yaml.includeTypes.includes('folder')) {
			files = getAllFiles(files, sourceFolderPath, this.yaml.depth);
		}

		if (files.length === 0) {
			updateLinkList(files, this.plugin, this.yaml, this.pathBlacklist, this.sourceFile);
			return this.addEditButton(root);
		}

		files = sortFiles(files, this.yaml, this.plugin);

		if (this.yaml.style === 'grid') {
			const grid = root.createEl('div', { cls: 'folder-overview-grid' });
			files.forEach(async (file) => {
				const gridItem = grid.createEl('div', { cls: 'folder-overview-grid-item' });
				const gridArticle = gridItem.createEl('article', { cls: 'folder-overview-grid-item-article' });
				if (file instanceof TFile) {
					const fileContent = await plugin.app.vault.read(file);
					const descriptionEl = gridArticle.createEl('p', { cls: 'folder-overview-grid-item-description' });
					let description = fileContent.split('\n')[0];
					if (description.length > 64) {
						description = description.slice(0, 64) + '...';
					}
					descriptionEl.innerText = description;
					const link = gridArticle.createEl('a', { cls: 'folder-overview-grid-item-link internal-link' });
					const title = link.createEl('h1', { cls: 'folder-overview-grid-item-link-title' });
					title.innerText = file.name.replace('.md', '').replace('.canvas', '');
					link.href = file.path;
				} else if (file instanceof TFolder) {
					const folderItem = gridArticle.createEl('div', { cls: 'folder-overview-grid-item-folder' });
					const folderName = folderItem.createEl('h1', { cls: 'folder-overview-grid-item-folder-name' });
					folderName.innerText = file.name;
				}
			});
		} else if (this.yaml.style === 'list') {
			renderListOverview(plugin, ctx, root, this.yaml, this.pathBlacklist, this);
		} else if (this.yaml.style === 'explorer') {
			const fileExplorerOverview = new FileExplorerOverview(plugin, ctx, root, this.yaml, this.pathBlacklist, this);
			this.plugin.app.workspace.onLayoutReady(async () => {
				await fileExplorerOverview.renderFileExplorer();
			});
		}

		if (this.yaml.useActualLinks) {
			setTimeout(() => {
				updateLinkList(files, this.plugin, this.yaml, this.pathBlacklist, this.sourceFile);
			}, 1000);
		} else {
			this.removeLinkList();
		}
		this.addEditButton(root);
	}

	removeLinkList() {
		this.plugin.app.vault.process(this.sourceFile, (text) => {
			const lines = text.split('\n');
			const linkListStart = `${this.yaml.isInCallout ? '> ' : ''}<span class="fv-link-list-start" id="${this.yaml.id}"></span>`;
			const linkListEnd = `${this.yaml.isInCallout ? '> ' : ''}<span class="fv-link-list-end" id="${this.yaml.id}"></span>`;

			const startIdx = lines.findIndex((l) => l.trim() === linkListStart);
			const endIdx = lines.findIndex((l) => l.trim() === linkListEnd);

			const linkListExists = startIdx !== -1 && endIdx !== -1;
			const isInvalidLinkList = endIdx < startIdx;

			if (!linkListExists || isInvalidLinkList) {
				return text;
			}

			lines.splice(startIdx, endIdx - startIdx + 1);
			return lines.join('\n');
		});
	}

	addEditButton(root: HTMLElement) {
		const editButton = root.createEl('button', { cls: 'folder-overview-edit-button' });
		editButton.innerText = 'Edit overview';
		editButton.addEventListener('click', (e) => {
			e.stopImmediatePropagation();
			e.preventDefault();
			e.stopPropagation();
			new FolderOverviewSettings(this.plugin.app as App, this.plugin, this.yaml, this.ctx, this.el, this.plugin instanceof FolderNotesPlugin ? this.plugin.settings.defaultOverview : this.plugin.settings.defaultOverviewSettings).open();
		}, { capture: true });
	}

	fileMenu(file: TFile, e: MouseEvent) {
		const plugin = this.plugin;
		const fileMenu = new Menu();

		fileMenu.addItem((item) => {
			item.setTitle('Edit folder overview');
			item.setIcon('pencil');
			item.onClick(async () => {
				new FolderOverviewSettings(plugin.app as App, plugin, this.yaml, this.ctx, this.el, plugin instanceof FolderNotesPlugin ? plugin.settings.defaultOverview : plugin.settings.defaultOverviewSettings).open();
			});
		});

		fileMenu.addSeparator();

		fileMenu.addItem((item) => {
			item.setTitle(window.i18next.t('plugins.file-explorer.menu-opt-rename'));
			item.setIcon('pencil');
			item.onClick(async () => {
				plugin.app.fileManager.promptForFileRename(file);
			});
		});

		fileMenu.addItem((item) => {
			item.setTitle(window.i18next.t('plugins.file-explorer.menu-opt-delete'));
			item.setIcon('trash');
			item.dom.addClass('is-warning');
			item.dom.setAttribute('data-section', 'danger');
			item.onClick(() => {
				plugin.app.fileManager.promptForDeletion(file);
			});
		});

		fileMenu.addSeparator();

		plugin.app.workspace.trigger('file-menu', fileMenu, file, 'folder-overview-file-context-menu', null);
		fileMenu.showAtPosition({ x: e.pageX, y: e.pageY });
	}

	folderMenu(folder: TFolder, e: MouseEvent) {
		const plugin = this.plugin;
		const folderMenu = new Menu();

		folderMenu.addItem((item) => {
			item.setTitle('Edit folder overview');
			item.setIcon('pencil');
			item.onClick(async () => {
				new FolderOverviewSettings(plugin.app as App, plugin, this.yaml, this.ctx, this.el, plugin instanceof FolderNotesPlugin ? plugin.settings.defaultOverview : plugin.settings.defaultOverviewSettings).open();
			});
		});

		folderMenu.addSeparator();

		folderMenu.addItem((item) => {
			item.setTitle('Rename');
			item.setIcon('pencil');
			item.onClick(async () => {
				if (plugin instanceof FolderNotesPlugin) {
					new NewFolderNameModal(plugin.app, plugin, folder).open();
				}
			});
		});

		folderMenu.addItem((item) => {
			item.setTitle('Delete');
			item.setIcon('trash');
			item.dom.addClass('is-warning');
			item.dom.setAttribute('data-section', 'danger');
			item.onClick(() => {
				plugin.app.fileManager.promptForFolderDeletion(folder);
			});
		});

		folderMenu.addSeparator();

		plugin.app.workspace.trigger('file-menu', folderMenu, folder, 'folder-overview-folder-context-menu', null);
		folderMenu.showAtPosition({ x: e.pageX, y: e.pageY });
	}

	editOverviewContextMenu(e: MouseEvent) {
		const plugin = this.plugin;
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle('Edit folder overview');
			item.setIcon('pencil');
			item.onClick(async () => {
				new FolderOverviewSettings(plugin.app as App, plugin, this.yaml, this.ctx, this.el, plugin instanceof FolderNotesPlugin ? plugin.settings.defaultOverview : plugin.settings.defaultOverviewSettings).open();
			});
		});
		menu.showAtPosition({ x: e.pageX, y: e.pageY });
	}

	getElFromOverview(path: string): HTMLElement | null {
		const el = this.listEl.querySelector(`[data-path='${CSS.escape(path)}']`) as HTMLElement | null;
		return el;
	}


}

export async function updateYaml(plugin: FolderOverviewPlugin | FolderNotesPlugin, ctx: MarkdownPostProcessorContext, el: HTMLElement, yaml: defaultOverviewSettings, addLinkList: boolean) {
	const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
	if (!(file instanceof TFile)) return;
	let stringYaml = stringifyYaml(yaml);
	plugin.app.vault.process(file, (text) => {
		const info = ctx.getSectionInfo(el);
		// check if stringYaml ends with a newline
		if (stringYaml[stringYaml.length - 1] !== '\n') {
			stringYaml += '\n';
		}

		if (info) {
			const { lineStart } = info;
			const lineEnd = getCodeBlockEndLine(text, lineStart);
			if (lineEnd === -1 || !lineEnd) return text;
			const lineLength = lineEnd - lineStart;
			const lines = text.split('\n');
			let overviewBlock = `\`\`\`folder-overview\n${stringYaml}\`\`\``;
			overviewBlock += addLinkList ? `\n<span class="fv-link-list-start" id="${yaml.id}"></span>\n<span class="fv-link-list-end" id="${yaml.id}"></span>` : '';
			lines.splice(lineStart, lineLength + 1, overviewBlock);
			return lines.join('\n');
		} else {
			getOverviews(plugin, file).then((overviews) => {
				overviews.forEach((overview) => {
					if (overview.id !== yaml.id) return;
					updateYamlById(plugin, yaml.id, file, yaml, addLinkList, overview.isInCallout as any as boolean ?? false);
				});
			});
		}
		return text;
	});
}

export function getCodeBlockEndLine(text: string, startLine: number, count = 1) {
	let line = startLine + 1;
	const lines = text.split('\n');
	while (line < lines.length) {
		if (count > 50) { return -1; }
		if (lines[line].startsWith('```')) {
			return line;
		}
		line++;
		count++;
	}
	return line;
}

export async function getOverviews(plugin: FolderOverviewPlugin | FolderNotesPlugin, file: TFile | null) {
	if (!file) return [];
	const overviews: { [key: string]: string }[] = [];
	const content = await plugin.app.vault.read(file);
	if (!content) return overviews;

	const yamlBlocks = content.match(/^(?!>).*```folder-overview\n(?:^(?!>).*[\r\n]*)*?^```$/gm);
	const calloutYamlBlocks = content.match(/^> ```folder-overview\n([\s\S]*?)```/gm);
	if (calloutYamlBlocks) {
		for (const block of calloutYamlBlocks) {
			const cleanedBlock = block.replace(/^> ```folder-overview\n/, '').replace(/```$/, '').replace(/^> ?/gm, '');
			const yaml = parseYaml(cleanedBlock);
			if (yaml) {
				yaml.isInCallout = true;
				overviews.push(yaml);
			}
		}
	}

	if (!yamlBlocks) return overviews;
	for (const block of yamlBlocks) {
		const yaml = parseYaml(block.replace('```folder-overview\n', '').replace('```', ''));
		if (!yaml) continue;
		overviews.push(yaml);
	}

	return overviews;
}

export async function updateYamlById(plugin: FolderOverviewPlugin | FolderNotesPlugin, overviewId: string, file: TFile, newYaml: defaultOverviewSettings, addLinkList: boolean, isCallout = false) {
	await plugin.app.vault.process(file, (text) => {
		const yamlBlocks = isCallout ? text.match(/^> ```folder-overview\n([\s\S]*?)```/gm) : text.match(/^(?!>).*```folder-overview\n(?:^(?!>).*[\r\n]*)*?^```$/gm);
		if (!yamlBlocks) return text;

		for (const block of yamlBlocks) {
			let cleanedBlock;
			if (isCallout) {
				cleanedBlock = block.replace('> ```folder-overview\n', '').replace('```', '');
				cleanedBlock = cleanedBlock.replace(/^> ?/gm, '');
			} else {
				cleanedBlock = block.replace('```folder-overview\n', '').replace('```', '');
			}

			const yaml = parseYaml(cleanedBlock);
			if (!yaml) continue;

			if (yaml.id === overviewId) {
				let stringYaml = stringifyYaml(newYaml);
				if (stringYaml[stringYaml.length - 1] !== '\n') {
					stringYaml += '\n';
				}

				let newBlock;

				if (isCallout) {
					newBlock = `> \`\`\`folder-overview\n${stringYaml.split('\n').map((line) => `> ${line}`).join('\n')}\n> \`\`\``;
				} else {
					newBlock = `\`\`\`folder-overview\n${stringYaml}\n\`\`\``;
				}

				if (addLinkList && !isCallout) {
					newBlock += `\n<span class="fv-link-list-start" id="${newYaml.id}"></span>\n<span class="fv-link-list-end" id="${newYaml.id}"></span>`;
				} else if (addLinkList && isCallout) {
					newBlock += `\n> <span class="fv-link-list-start" id="${newYaml.id}"></span>\n> <span class="fv-link-list-end" id="${newYaml.id}"></span>`;
				}

				text = text.replace(block, newBlock);
			}
		}
		return text;
	});
}

export async function hasOverviewYaml(plugin: FolderOverviewPlugin | FolderNotesPlugin, file: TFile): Promise<boolean> {
	const content = await plugin.app.vault.read(file);
	if (!content) return false;

	const yamlBlocks = content.match(/```folder-overview\n([\s\S]*?)```/g);
	return !!yamlBlocks;
}


export function parseOverviewTitle(overview: defaultOverviewSettings, plugin: FolderOverviewPlugin | FolderNotesPlugin, folder: TFolder | null, sourceFile?: TFile): string {
	const sourceFolderPath = overview.folderPath.trim();
	let title = overview.title;

	const variables: Record<string, string> = {
		'folderName': folder?.path === '/' || sourceFolderPath === '/' ? 'Vault' : folder?.name ?? '',
		'folderPath': folder?.path ?? sourceFolderPath ?? '',
		'filePath': sourceFile?.path ?? '',
		'fileName': sourceFile instanceof TFile ? sourceFile.basename : '',
	};

	if (sourceFile instanceof TFile) {
		const fileCache = plugin.app.metadataCache.getFileCache(sourceFile);
		const frontmatter = fileCache?.frontmatter ?? {};
		const propertyRegex = /\{\{properties\.([\w-]+)\}\}/g;

		title = title.replace(propertyRegex, (_, prop) => {
			const value = frontmatter[prop];
			return value !== undefined ? String(value) : '';
		});
		title = title.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '');
	}

	return title;
}


class CustomMarkdownRenderChild extends MarkdownRenderChild {
	folderOverview: FolderOverview;
	constructor(el: HTMLElement, folderOverview: FolderOverview) {
		super(el);
		this.folderOverview = folderOverview;
	}

	onunload() {
		this.folderOverview.disconnectListeners();
	}
}

export function sortFiles(files: TAbstractFile[], yaml: defaultOverviewSettings, plugin: FolderOverviewPlugin | FolderNotesPlugin): TAbstractFile[] {
	if (!yaml?.sortBy) {
		const defaultSettings = plugin instanceof FolderNotesPlugin ? plugin.settings.defaultOverview : plugin.settings.defaultOverviewSettings;
		yaml.sortBy = defaultSettings.sortBy ?? 'name';
		yaml.sortByAsc = defaultSettings.sortByAsc ?? false;
	}

	const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

	files.sort((a, b) => {
		if (a instanceof TFolder && !(b instanceof TFolder)) {
			return -1;
		}
		if (!(a instanceof TFolder) && b instanceof TFolder) {
			return 1;
		}

		if (a instanceof TFolder && b instanceof TFolder) {
			return yaml.sortByAsc
				? collator.compare(a.name, b.name)
				: collator.compare(b.name, a.name);
		}

		if (a instanceof TFile && b instanceof TFile) {
			if (yaml.sortBy === 'created') {
				return yaml.sortByAsc ? a.stat.ctime - b.stat.ctime : b.stat.ctime - a.stat.ctime;
			} else if (yaml.sortBy === 'modified') {
				return yaml.sortByAsc ? a.stat.mtime - b.stat.mtime : b.stat.mtime - a.stat.mtime;
			} else if (yaml.sortBy === 'name') {
				return yaml.sortByAsc
					? collator.compare(a.basename, b.basename)
					: collator.compare(b.basename, a.basename);
			}
		}

		return 0;
	});

	return files;
}

export async function filterFiles(files: TAbstractFile[], plugin: FolderOverviewPlugin | FolderNotesPlugin, sourceFolderPath: string, depth: number, pathBlacklist: string[], yaml: defaultOverviewSettings, sourceFile: TFile): Promise<TAbstractFile[]> {
	const filteredFiles = await Promise.all(files.map(async (file) => {
		const folderPath = getFolderPathFromString(file.path);
		const dontShowFolderNote = pathBlacklist.includes(file.path);
		const isSubfolder = sourceFolderPath === '/' || folderPath.startsWith(sourceFolderPath);
		const isSourceFile = file.path === sourceFile.path;
		let isExcludedFromOverview = false;
		const isFile = file instanceof TFile;
		const includeTypes = yaml.includeTypes || [];
		const extension = isFile ? file.extension.toLowerCase() : '';

		if (isFile && includeTypes.length > 0 && !includeTypes.includes('all')) {
			if ((extension === 'md' || extension === 'markdown') && !includeTypes.includes('markdown')) return null;
			if (extension === 'canvas' && !includeTypes.includes('canvas')) return null;
			if (extension === 'pdf' && !includeTypes.includes('pdf')) return null;
			const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
			if (imageTypes.includes(extension) && !includeTypes.includes('image')) return null;
			const videoTypes = ['mp4', 'webm', 'ogv', 'mov', 'mkv'];
			if (videoTypes.includes(extension) && !includeTypes.includes('video')) return null;
			const audioTypes = ['mp3', 'wav', 'm4a', '3gp', 'flac', 'ogg', 'oga', 'opus'];
			if (audioTypes.includes(extension) && includeTypes.includes('audio')) return null;
			const allTypes = ['markdown', 'md', 'canvas', 'pdf', ...imageTypes, ...videoTypes, ...audioTypes];
			if (!allTypes.includes(extension) && !includeTypes.includes('other')) return null;
		}

		if (plugin instanceof FolderNotesPlugin) {
			isExcludedFromOverview = (getExcludedFolder(plugin, file.path, true))?.excludeFromFolderOverview ?? false;
		}

		if ((dontShowFolderNote && !yaml.showFolderNotes) || !isSubfolder || isSourceFile || isExcludedFromOverview) {
			return null;
		}

		const fileDepth = file.path.split('/').length - (sourceFolderPath === '/' ? 0 : sourceFolderPath.split('/').length);
		return fileDepth <= depth ? file : null;
	}));

	return filteredFiles.filter((file) => file !== null) as TAbstractFile[];
}

export function updateLinkList(files: TAbstractFile[] = [], plugin: FolderOverviewPlugin | FolderNotesPlugin, yaml: defaultOverviewSettings, pathBlacklist: string[], sourceFile: TFile) {
	buildLinkList(files, plugin, yaml, pathBlacklist, sourceFile).then((fileLinks: string[]) => {
		plugin.app.vault.process(sourceFile, (text) => {
			const lines = text.split('\n');
			const linkListStart = `${yaml.isInCallout ? '> ' : ''}<span class="fv-link-list-start" id="${yaml.id}"></span>`;
			const linkListEnd = `${yaml.isInCallout ? '> ' : ''}<span class="fv-link-list-end" id="${yaml.id}"></span>`;

			const startIdx = lines.findIndex((l) => l.trim() === linkListStart);
			const endIdx = lines.findIndex((l) => l.trim() === linkListEnd);

			const linkListExists = startIdx !== -1 && endIdx !== -1;
			const isInvalidLinkList = endIdx < startIdx;
			if (!linkListExists || isInvalidLinkList) {
				return text;
			}

			lines.splice(startIdx, endIdx - startIdx + 1);

			// Add the file/folder links into the text
			const newBlock = [
				linkListStart,
				...fileLinks,
				linkListEnd,
			];
			lines.splice(startIdx, 0, ...newBlock);

			return lines.join('\n');
		});
	});
}

async function buildLinkList(
	items: TAbstractFile[],
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
	yaml: defaultOverviewSettings,
	pathBlacklist: string[],
	sourceFile: TFile,
	indent = 0
): Promise<string[]> {
	const result: string[] = [];
	const filtered = (await filterFiles(
		items,
		plugin,
		yaml.folderPath,
		yaml.depth,
		pathBlacklist,
		yaml,
		sourceFile
	)).filter((file): file is TAbstractFile => file !== null);

	const sorted = sortFiles(filtered, yaml, plugin);

	for (const item of sorted) {
		const indentStr = '\t'.repeat(indent);

		if (item instanceof TFile) {
			if (yaml.hideLinkList) {
				result.push(`${yaml.isInCallout ? '> ' : ''}${indentStr}- [[${item.path}|${item.basename}]] <span class="fv-link-list-item"></span>`);
			} else {
				result.push(`${yaml.isInCallout ? '> ' : ''}${indentStr}- [[${item.path}|${item.basename}]]`);
			}
		} else if (item instanceof TFolder) {
			let line = `${yaml.isInCallout ? '> ' : ''}${indentStr}- ${item.name}`;
			let folderNote: TFile | null | undefined = null;

			if (plugin instanceof FolderNotesPlugin) {
				folderNote = getFolderNote(plugin, item.path);
			}

			if (folderNote) {
				line = `${yaml.isInCallout ? '> ' : ''}${indentStr}- [[${folderNote.path}|${item.name}]]`;
			}

			if (yaml.hideLinkList) {
				line += ' <span class="fv-link-list-item"></span>';
			}
			result.push(line);

			const children = item.children.filter(
				(child) => !(child instanceof TFile && folderNote && child.path === folderNote.path)
			);
			if (children.length > 0) {
				const childLinks = await buildLinkList(children, plugin, yaml, pathBlacklist, sourceFile, indent + 1);
				result.push(...childLinks);
			}
		}
	}
	return result;
}

export function getAllFiles(files: TAbstractFile[], sourceFolderPath: string, depth: number) {
	const allFiles: TAbstractFile[] = [];

	const getDepth = (filePath: string) => {
		return filePath.split('/').length - sourceFolderPath.split('/').length;
	};

	files.forEach((file) => {
		const fileDepth = getDepth(file.path);

		if (file instanceof TFolder) {
			if (fileDepth < depth) {
				allFiles.push(...getAllFiles(file.children, sourceFolderPath, depth));
			}
		} else {
			allFiles.push(file);
		}
	});

	return allFiles;
}

