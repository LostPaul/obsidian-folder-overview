import {
	type TAbstractFile,
	type MarkdownPostProcessorContext,
	parseYaml,
	TFolder,
	TFile,
	stringifyYaml,
	Notice,
	Menu,
	MarkdownRenderChild,
} from 'obsidian';
import { FolderOverviewSettings } from './modals/Settings';
import { getExcludedFolder } from '../../ExcludeFolders/functions/folderFunctions';
import { getFolderPathFromString } from '../../functions/utils';
import { FileExplorerOverview } from './styles/FileExplorer';
import { renderListOverview } from './styles/List';
import NewFolderNameModal from '../../modals/NewFolderName';
import { CustomEventEmitter } from './utils/EventEmitter';
import type FolderOverviewPlugin from './main';
import FolderNotesPlugin from '../../main';
import { getFolder } from '../../functions/folderNoteFunctions';
import { removeLinkList, updateLinkList } from './utils/LinkList';
import {
	buildYamlConfig,
	getCodeBlockEndLine,
	replacePropertiesInTitle,
	replaceVariablesInTitle,
	updateYamlById,
} from './utils/functions';

export type includeTypes =
	| 'folder'
	| 'markdown'
	| 'canvas'
	| 'other'
	| 'pdf'
	| 'image'
	| 'audio'
	| 'video'
	| 'all';

export interface defaultOverviewSettings {
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
	useWikilinks: boolean;
}

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
	sourceFolder: TFolder | undefined | null;
	root: HTMLElement;
	listEl: HTMLUListElement;
	defaultSettings: defaultOverviewSettings;
	sourceFile: TFile | undefined;
	counter = 0;

	LINK_LIST_UPDATE_DELAY_MS = 1000;

	eventListeners: (() => void)[] = [];
	constructor(
		plugin: FolderNotesPlugin | FolderOverviewPlugin,
		ctx: MarkdownPostProcessorContext,
		source: string,
		el: HTMLElement,
		defaultSettings: defaultOverviewSettings,
	) {
		this.plugin = plugin;
		this.emitter = new CustomEventEmitter();
		const yaml = this.parseYamlOrUseDefault(source);
		const includeTypes = yaml?.includeTypes ||
			defaultSettings.includeTypes ||
			['folder', 'markdown'];
		this.ctx = ctx;
		this.source = source;
		this.el = el;
		this.sourceFile = this.getSourceFile(ctx);
		this.yaml = buildYamlConfig(
			yaml,
			defaultSettings,
			ctx,
			includeTypes,
		);

		this.setSourceFolder();

		this.defaultSettings = defaultSettings;

		const customChild = new CustomMarkdownRenderChild(el, this);
		ctx.addChild(customChild);
	}

	async create(
		plugin: FolderOverviewPlugin | FolderNotesPlugin,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): Promise<void> {
		el.empty();
		if (!(this.sourceFile instanceof TFile)) return;
		el.parentElement?.classList.add('folder-overview-container');
		if (this.yaml.hideFolderOverview) {
			if (this.yaml.isInCallout) {
				el?.classList.add('fv-hide-overview');
			} else {
				el.parentElement?.classList.add('fv-hide-overview');
			}
		}

		el.parentElement?.addEventListener(
			'contextmenu', (e) => this.editOverviewContextMenu(e),
			{ capture: true },
		);

		this.root = el.createEl('div', { cls: 'folder-overview' });

		const headingTag = `h${this.yaml.titleSize}` as keyof HTMLElementTagNameMap;
		const titleEl = this.root.createEl(headingTag, { cls: 'folder-overview-title' });

		this.listEl = this.root.createEl('ul', { cls: 'folder-overview-list' });

		if (this.hasNoIncludedTypes(this.root)) return;

		let sourceFolderPath =
			(this.yaml.folderPath.trim() || getFolderPathFromString(ctx.sourcePath)) || '/';

		this.registerListeners();

		await this.renderTitle(
			this.sourceFolder, sourceFolderPath,
			this.sourceFile as TFile, titleEl,
		);

		if (!this.validateSourceFolder(this.sourceFolder, sourceFolderPath)) {
			this.addEditButton(this.root);
			return;
		}

		let files = this.getInitialFiles(plugin, this.sourceFolder);

		files = await this.filterAndProcessFiles(
			files, plugin, sourceFolderPath,
			this.yaml, this.sourceFile,
		);

		if (files.length === 0) {
			updateLinkList(
				files,
				this.plugin,
				this.yaml,
				this.pathBlacklist,
				this.sourceFile,
			);
			this.addEditButton(this.root);
			return;
		}

		files = sortFiles(files, this.yaml, this.plugin);

		this.renderOverviewStyle(plugin, ctx, this.root);

		this.handleLinkList(files);

		this.addEditButton(this.root);
	}

	private parseYamlOrUseDefault(source: string): defaultOverviewSettings {
		let yaml: defaultOverviewSettings = parseYaml(source);
		if (!yaml) {
			yaml = {} as defaultOverviewSettings;
		}
		return yaml;
	}

	private getSourceFile(
		ctx: MarkdownPostProcessorContext,
	): TFile | undefined {
		const sourceFile = this.plugin.app.vault.getAbstractFileByPath(
			ctx.sourcePath,
		);
		if (sourceFile instanceof TFile) {
			return sourceFile;
		}
		return undefined;
	}

	on(event: string, listener: (data?: unknown) => void): void {
		this.emitter.on(event, listener);
	}

	off(event: string, listener: (data?: unknown) => void): void {
		this.emitter.off(event, listener);
	}

	private emit(event: string, data?: unknown): void {
		this.emitter.emit(event, data);
	}

	handleVaultChange(eventType: string): void {
		if (this.yaml.autoSync) {
			this.emit('vault-change', eventType);
		}
	}

	disconnectListeners(): void {
		this.eventListeners.forEach((unregister) => unregister());
		this.eventListeners = [];
	}

	registerListeners(): void {
		const { plugin } = this;
		const handleRename = (): void => this.handleVaultChange('renamed');
		const handleCreate = (): void => this.handleVaultChange('created');
		const handleDelete = (): void => this.handleVaultChange('deleted');

		plugin.app.vault.on('rename', handleRename);
		plugin.app.vault.on('create', handleCreate);
		plugin.app.vault.on('delete', handleDelete);

		this.eventListeners.push(() => plugin.app.vault.off('rename', handleRename));
		this.eventListeners.push(() => plugin.app.vault.off('create', handleCreate));
		this.eventListeners.push(() => plugin.app.vault.off('delete', handleDelete));
	}

	setSourceFolder(): void {
		switch (this.yaml?.folderPath.trim()) {
			case '':
			case 'File’s parent folder path': {
				const folderPath = getFolderPathFromString(this.ctx.sourcePath);
				const sourceFolder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
				if (sourceFolder instanceof TFolder) {
					this.yaml.folderPath = sourceFolder.path;
					this.sourceFolder = sourceFolder;
				}
				break;
			}
			case 'Path of folder linked to the file': {
				if (this.plugin instanceof FolderNotesPlugin && this.sourceFile instanceof TFile) {
					const folderNoteFolder = getFolder(this.plugin, this.sourceFile);
					if (folderNoteFolder instanceof TFolder) {
						this.sourceFolder = folderNoteFolder;
						this.yaml.folderPath = folderNoteFolder.path;
					} else {
						this.yaml.folderPath = '';
					}
				}
				break;
			}
			default: {
				const sourceFolder = this.plugin.app.vault
					.getAbstractFileByPath(this.yaml.folderPath);
				if (sourceFolder instanceof TFolder) {
					this.sourceFolder = sourceFolder;
				}
			}
		}
	}

	private async filterAndProcessFiles(
		files: TAbstractFile[], plugin: FolderOverviewPlugin | FolderNotesPlugin,
		sourceFolderPath: string,
		yaml: defaultOverviewSettings,
		sourceFile: TFile,
	): Promise<TAbstractFile[]> {
		let filteredFiles = await filterFiles(
			files,
			plugin,
			sourceFolderPath,
			yaml.depth,
			this.pathBlacklist,
			yaml,
			sourceFile,
		);

		if (!yaml.includeTypes.includes('folder')) {
			filteredFiles = getAllFiles(filteredFiles, sourceFolderPath, yaml.depth);
		}

		return filteredFiles;
	}

	private hasNoIncludedTypes(root: HTMLElement): boolean {
		if (this.yaml.includeTypes.length === 0) {
			this.addEditButton(root);
			return true;
		}
		return false;
	}

	private handleLinkList(files: TAbstractFile[]): void {
		if (this.yaml.useActualLinks) {
			if (this.sourceFile) {
				setTimeout(() => {
					updateLinkList(
						files, this.plugin, this.yaml,
						this.pathBlacklist, this.sourceFile as TFile,
					);
				}, this.LINK_LIST_UPDATE_DELAY_MS);
			}
		} else {
			removeLinkList(this.plugin, this.sourceFile, this.yaml);
		}
	}

	private async renderTitle(
		sourceFolder: TFolder | undefined | null,
		sourceFolderPath: string,
		sourceFile: TFile,
		titleEl: HTMLElement,
	): Promise<void> {
		if (!this.yaml.showTitle) return;
		const variables = {
			folderName: sourceFolder?.path === '/' || sourceFolderPath === '/'
				? 'Vault'
				: sourceFolder?.name ?? '',
			folderPath: sourceFolder?.path ?? sourceFolderPath ?? '',
			filePath: sourceFile.path,
			fileName: sourceFile instanceof TFile ? sourceFile.basename : '',
			fmtpFileName: (await this.plugin.fmtpHandler?.getNewFileName(sourceFile)) ?? '',
		};
		const fileCache = this.plugin.app.metadataCache.getFileCache(sourceFile);
		const frontmatter = fileCache?.frontmatter ?? {};
		let { title } = this.yaml;

		title = replacePropertiesInTitle(title, frontmatter);
		title = replaceVariablesInTitle(title, variables);

		titleEl.innerText = title;
	}

	private validateSourceFolder(
		sourceFolder: TFolder | undefined | null,
		sourceFolderPath: string,
	): boolean {
		if (
			!sourceFolder &&
			sourceFolderPath !== '/' &&
			sourceFolderPath !== ''
		) {
			new Notice("Folder overview: Couldn't find the folder");
			return false;
		}
		if (!sourceFolder && sourceFolderPath === '') {
			sourceFolderPath = '/';
		}
		if (!(sourceFolder instanceof TFolder) && sourceFolderPath !== '/') {
			return false;
		}
		return true;
	}

	private getInitialFiles(
		plugin: FolderOverviewPlugin | FolderNotesPlugin,
		sourceFolder: TFolder | undefined | null,
	): TAbstractFile[] {
		if (sourceFolder?.path === '/') {
			const rootFiles: TAbstractFile[] = [];
			plugin.app.vault
				.getAllLoadedFiles()
				.filter((f) => f.parent?.path === '/')
				.forEach((file) => {
					if (!file.path.includes('/')) {
						rootFiles.push(file);
					}
				});
			return rootFiles;
		} else if (sourceFolder instanceof TFolder) {
			return sourceFolder.children;
		}
		return [];
	}

	private renderOverviewStyle(
		plugin: FolderOverviewPlugin | FolderNotesPlugin,
		ctx: MarkdownPostProcessorContext,
		root: HTMLElement,
	): void {
		if (this.yaml.style === 'grid') {
		} else if (this.yaml.style === 'list') {
			renderListOverview(
				plugin, ctx, root,
				this.yaml, this.pathBlacklist, this,
			);
		} else if (this.yaml.style === 'explorer') {
			const fileExplorerOverview = new FileExplorerOverview(
				plugin, ctx, root,
				this.yaml, this.pathBlacklist, this,
			);
			this.plugin.app.workspace.onLayoutReady(async () => {
				await fileExplorerOverview.renderFileExplorer();
			});
		}
	}

	addEditButton(root: HTMLElement): void {
		const editButton = root.createEl('button', { cls: 'folder-overview-edit-button' });
		editButton.innerText = 'Edit overview';
		editButton.addEventListener('click', (e) => {
			e.stopImmediatePropagation();
			e.preventDefault();
			e.stopPropagation();
			new FolderOverviewSettings(
				this.plugin.app, this.plugin, this.yaml,
				this.ctx, this.el,
				this.plugin instanceof FolderNotesPlugin
					? this.plugin.settings.defaultOverview
					: this.plugin.settings.defaultOverviewSettings,
			).open();
		}, { capture: true });
	}

	fileMenu(file: TFile, e: MouseEvent): void {
		const { plugin } = this;
		const fileMenu = new Menu();

		fileMenu.addItem((item) => {
			item.setTitle('Edit folder overview');
			item.setIcon('pencil');
			item.onClick(async () => {
				new FolderOverviewSettings(
					plugin.app, plugin, this.yaml,
					this.ctx, this.el,
					plugin instanceof FolderNotesPlugin
						? plugin.settings.defaultOverview
						: plugin.settings.defaultOverviewSettings,
				).open();
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

		plugin.app.workspace.trigger(
			'file-menu', fileMenu,
			file, 'folder-overview-file-context-menu',
			null,
		);
		fileMenu.showAtPosition({ x: e.pageX, y: e.pageY });
	}

	folderMenu(folder: TFolder, e: MouseEvent): void {
		const { plugin } = this;
		const folderMenu = new Menu();

		folderMenu.addItem((item) => {
			item.setTitle('Edit folder overview');
			item.setIcon('pencil');
			item.onClick(async () => {
				new FolderOverviewSettings(
					plugin.app, plugin,
					this.yaml, this.ctx, this.el,
					plugin instanceof FolderNotesPlugin
						? plugin.settings.defaultOverview
						: plugin.settings.defaultOverviewSettings,
				).open();
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

		plugin.app.workspace.trigger(
			'file-menu', folderMenu, folder,
			'folder-overview-folder-context-menu',
			null,
		);
		folderMenu.showAtPosition({ x: e.pageX, y: e.pageY });
	}

	editOverviewContextMenu(e: MouseEvent): void {
		const { plugin } = this;
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle('Edit folder overview');
			item.setIcon('pencil');
			item.onClick(async () => {
				new FolderOverviewSettings(
					plugin.app, plugin, this.yaml,
					this.ctx, this.el,
					plugin instanceof FolderNotesPlugin
						? plugin.settings.defaultOverview
						: plugin.settings.defaultOverviewSettings,
				).open();
			});
		});
		menu.showAtPosition({ x: e.pageX, y: e.pageY });
	}

	getElFromOverview(path: string): HTMLElement | null {
		const selector = `[data-path='${CSS.escape(path)}']`;
		const el = this.listEl.querySelector(selector) as HTMLElement | null;
		return el;
	}
}

export async function updateYaml(
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
	ctx: MarkdownPostProcessorContext,
	el: HTMLElement,
	yaml: defaultOverviewSettings,
	addLinkList: boolean,
): Promise<void> {
	const NO_CODEBLOCK_END = -1;
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
			if (lineEnd === NO_CODEBLOCK_END || !lineEnd) return text;
			const lineLength = lineEnd - lineStart;
			const lines = text.split('\n');
			let overviewBlock = `\`\`\`folder-overview\n${stringYaml}\`\`\``;
			overviewBlock += addLinkList
				? (
					`\n<span class="fv-link-list-start" id="${yaml.id}"></span>` +
					`\n<span class="fv-link-list-end" id="${yaml.id}"></span>`
				)
				: '';
			lines.splice(lineStart, lineLength + 1, overviewBlock);
			return lines.join('\n');
		}
		getOverviews(plugin, file).then((overviews) => {
			overviews.forEach((overview) => {
				if (overview.id !== yaml.id) return;
				const isInCallout = typeof overview.isInCallout === 'boolean'
					? overview.isInCallout
					: false;
				updateYamlById(
					plugin, yaml.id, file,
					yaml, addLinkList, isInCallout,
				);
			});
		});
		return text;
	});
}

export async function getOverviews(
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
	file: TFile | null,
): Promise<defaultOverviewSettings[]> {
	if (!file) return [];
	const overviews: defaultOverviewSettings[] = [];
	const content = await plugin.app.vault.read(file);
	if (!content) return overviews;

	const yamlBlocks = content.match(/^(?!>).*```folder-overview\n(?:^(?!>).*[\r\n]*)*?^```$/gm);
	const calloutYamlBlocks = content.match(/^> ```folder-overview\n([\s\S]*?)```/gm);
	if (calloutYamlBlocks) {
		for (const block of calloutYamlBlocks) {
			const cleanedBlock = block
				.replace(/^> ```folder-overview\n/, '')
				.replace(/```$/, '')
				.replace(/^> ?/gm, '');
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

export async function hasOverviewYaml(
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
	file: TFile,
): Promise<boolean> {
	const content = await plugin.app.vault.read(file);
	if (!content) return false;

	const yamlBlocks = content.match(/```folder-overview\n([\s\S]*?)```/g);
	return !!yamlBlocks;
}

class CustomMarkdownRenderChild extends MarkdownRenderChild {
	folderOverview: FolderOverview;
	constructor(el: HTMLElement, folderOverview: FolderOverview) {
		super(el);
		this.folderOverview = folderOverview;
	}

	onunload(): void {
		this.folderOverview.disconnectListeners();
	}
}

export function sortFiles(
	files: TAbstractFile[],
	yaml: defaultOverviewSettings,
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
): TAbstractFile[] {
	if (!yaml?.sortBy) {
		const defaultSettings =
			plugin instanceof FolderNotesPlugin
				? plugin.settings.defaultOverview
				: plugin.settings.defaultOverviewSettings;
		yaml.sortBy = defaultSettings.sortBy ?? 'name';
		yaml.sortByAsc = defaultSettings.sortByAsc ?? false;
	}

	const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

	const FOLDER_FIRST = -1;
	const FILE_FIRST = 1;
	const EQUAL = 0;

	function compareFilesAndFolders(a: TAbstractFile, b: TAbstractFile): number {
		const a_IsFolder = a instanceof TFolder;
		const b_IsFolder = b instanceof TFolder;
		const a_IsFile = a instanceof TFile;
		const b_IsFile = b instanceof TFile;

		if (a_IsFolder && !b_IsFolder) {
			return FOLDER_FIRST;
		}

		if (!a_IsFolder && b_IsFolder) {
			return FILE_FIRST;
		}

		if (a_IsFolder && b_IsFolder) {
			return yaml.sortByAsc
				? collator.compare(a.name, b.name)
				: collator.compare(b.name, a.name);
		}

		if (a_IsFile && b_IsFile) {
			return compareFiles(a as TFile, b as TFile);
		}

		return EQUAL;
	}

	function compareFiles(a: TFile, b: TFile): number {
		if (yaml.sortBy === 'created') {
			return yaml.sortByAsc ? a.stat.ctime - b.stat.ctime : b.stat.ctime - a.stat.ctime;
		} else if (yaml.sortBy === 'modified') {
			return yaml.sortByAsc ? a.stat.mtime - b.stat.mtime : b.stat.mtime - a.stat.mtime;
		} else if (yaml.sortBy === 'name') {
			return yaml.sortByAsc
				? collator.compare(a.basename, b.basename)
				: collator.compare(b.basename, a.basename);
		}
		return 0;
	}

	files.sort(compareFilesAndFolders);

	return files;
}

export async function filterFiles(
	files: TAbstractFile[],
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
	sourceFolderPath: string,
	depth: number,
	pathBlacklist: string[],
	yaml: defaultOverviewSettings,
	sourceFile: TFile | undefined,
): Promise<TAbstractFile[]> {
	const filteredFiles = await Promise.all(
		files.map(async (file) => filterSingleFile(
			file, plugin, sourceFolderPath,
			depth, pathBlacklist, yaml, sourceFile,
		)),
	);

	return filteredFiles.filter((file) => file !== null) as TAbstractFile[];
}

async function filterSingleFile(
	file: TAbstractFile,
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
	sourceFolderPath: string,
	depth: number,
	pathBlacklist: string[],
	yaml: defaultOverviewSettings,
	sourceFile: TFile | undefined,
): Promise<TAbstractFile | null> {
	const folderPath = getFolderPathFromString(file.path);
	const dontShowFolderNote = pathBlacklist.includes(file.path);
	const isSubfolder = isFileInSubfolder(sourceFolderPath, folderPath);
	const isSourceFile = sourceFile ? file.path === sourceFile.path : false;
	const isFile = file instanceof TFile;
	const includeTypes = yaml.includeTypes || [];
	const extension = isFile ? file.extension.toLowerCase() : '';

	const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
	const videoTypes = ['mp4', 'webm', 'ogv', 'mov', 'mkv'];
	const audioTypes = [
		'mp3', 'wav', 'm4a', '3gp',
		'flac', 'ogg', 'oga', 'opus',
	];

	if (isFile && !isFileTypeIncluded(
		extension, includeTypes, imageTypes, videoTypes, audioTypes,
	)) {
		return null;
	}

	const isExcludedFromOverview = await getIsExcludedFromOverview(plugin, file);

	if (
		shouldExcludeFile(
			dontShowFolderNote, yaml.showFolderNotes,
			isSubfolder, isSourceFile, isExcludedFromOverview,
		)
	) {
		return null;
	}

	const fileDepth = getFileDepth(file.path, sourceFolderPath);

	return fileDepth <= depth ? file : null;
}

// eslint-disable-next-line complexity
function isFileTypeIncluded(
	extension: string,
	includeTypes: includeTypes[],
	imageTypes: string[],
	videoTypes: string[],
	audioTypes: string[],
): boolean {
	if (includeTypes.length === 0 || includeTypes.includes('all')) return true;
	if ((extension === 'md' || extension === 'markdown') &&
		includeTypes.includes('markdown')) return true;
	if (extension === 'canvas' && includeTypes.includes('canvas')) return true;
	if (extension === 'pdf' && includeTypes.includes('pdf')) return true;
	if (imageTypes.includes(extension) && includeTypes.includes('image')) return true;
	if (videoTypes.includes(extension) && includeTypes.includes('video')) return true;
	if (audioTypes.includes(extension) && includeTypes.includes('audio')) return true;
	return false;
}

function isFileInSubfolder(sourceFolderPath: string, folderPath: string): boolean {
	return sourceFolderPath === '/' || folderPath.startsWith(sourceFolderPath);
}


async function getIsExcludedFromOverview(
	plugin: FolderOverviewPlugin | FolderNotesPlugin,
	file: TAbstractFile,
): Promise<boolean> {
	if (plugin instanceof FolderNotesPlugin) {
		const excluded = getExcludedFolder(plugin, file.path, true);
		return excluded?.excludeFromFolderOverview ?? false;
	}
	return false;
}

function shouldExcludeFile(
	dontShowFolderNote: boolean,
	showFolderNotes: boolean,
	isSubfolder: boolean,
	isSourceFile: boolean,
	isExcludedFromOverview: boolean,
): boolean {
	return (
		(dontShowFolderNote && !showFolderNotes) ||
		!isSubfolder || isSourceFile || isExcludedFromOverview
	);
}

function getFileDepth(filePath: string, sourceFolderPath: string): number {
	return (
		filePath.split('/').length -
		(sourceFolderPath === '/' ? 0 : sourceFolderPath.split('/').length)
	);
}

export function getAllFiles(
	files: TAbstractFile[],
	sourceFolderPath: string,
	depth: number,
): TAbstractFile[] {
	const allFiles: TAbstractFile[] = [];

	const getDepth = (filePath: string): number => {
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
