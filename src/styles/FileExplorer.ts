import {
	TFolder, TFile,
	setIcon, debounce,
	type MarkdownPostProcessorContext,
	type TAbstractFile,
} from 'obsidian';
import { getFolderNote } from '../../../functions/folderNoteFunctions';
import { getExcludedFolder } from '../../../ExcludeFolders/functions/folderFunctions';
import { getFolderPathFromString } from '../../../functions/utils';
import { getFileExplorerElement } from '../../../functions/styleFunctions';
import {
	sortFiles, filterFiles, type FolderOverview, type defaultOverviewSettings,
} from '../FolderOverview';
import type FolderOverviewPlugin from '../main';
import FolderNotesPlugin from '../../../main';

export class FileExplorerOverview {
	plugin: FolderOverviewPlugin | FolderNotesPlugin;
	folderOverview: FolderOverview;
	pathBlacklist: string[];
	source: string;
	yaml: defaultOverviewSettings;
	root: HTMLElement;

	eventListeners: (() => void)[] = [];
	constructor(
		plugin: FolderOverviewPlugin | FolderNotesPlugin,
		ctx: MarkdownPostProcessorContext,
		root: HTMLElement,
		yaml: defaultOverviewSettings,
		pathBlacklist: string[],
		folderOverview: FolderOverview,
	) {
		this.plugin = plugin;
		this.folderOverview = folderOverview;
		this.pathBlacklist = pathBlacklist;
		this.source = ctx.sourcePath;
		this.yaml = yaml;
		this.root = root;
	}

	disconnectListeners(): void {
		this.eventListeners.forEach((unregister) => {
			unregister();
		});
		this.eventListeners = [];
	}

	async renderFileExplorer(): Promise<void> {
		this.disconnectListeners();
		const plugin = this.plugin;
		const ctx = this.folderOverview.ctx;
		const root = this.folderOverview.root;
		const yaml = this.folderOverview.yaml;
		const folderOverview = this.folderOverview;
		let folder: HTMLElement | null = null;
		if (plugin instanceof FolderNotesPlugin) {
			folder = getFileExplorerElement(yaml.folderPath, plugin);
		}
		let folderElement = folder?.parentElement;
		const overviewList = folderOverview.listEl;
		overviewList?.empty();
		if (!overviewList) return;

		let tFolder = plugin.app.vault.getAbstractFileByPath(yaml.folderPath);
		if (!tFolder && yaml.folderPath.trim() === '') {
			if (ctx.sourcePath.includes('/')) {
				const folderPath = getFolderPathFromString(ctx.sourcePath);
				tFolder = plugin.app.vault.getAbstractFileByPath(folderPath);
			} else {
				yaml.folderPath = '/';
				tFolder = plugin.app.vault.getAbstractFileByPath('/');
			}
		}

		if (!folderElement && !tFolder) return;

		const sourceFolderPath = tFolder?.path || '';

		folderElement = document.querySelectorAll('.nav-files-container')[0] as HTMLElement;
		if (!folderElement) {
			folderElement = root.createDiv({
				cls: 'nav-files-container',
			});
		}

		const newFolderElement = folderElement.cloneNode(true) as HTMLElement;

		newFolderElement.querySelectorAll('div.nav-folder-title').forEach((el) => {
			const folderItem = plugin.app.vault.getAbstractFileByPath(
				el.getAttribute('data-path') || '',
			);
			if (!(folderItem instanceof TFolder)) return;
			if (yaml.alwaysCollapse) {
				folderItem.collapsed = true;
				el.classList.add('is-collapsed');
			} else {
				if (yaml.storeFolderCondition) {
					if (folderItem.collapsed) {
						el.classList.add('is-collapsed');
					} else {
						el.classList.remove('is-collapsed');
					}
				} else {
					if (el.parentElement?.classList.contains('is-collapsed')) {
						folderItem.collapsed = true;
					} else {
						folderItem.collapsed = false;
					}
				}
			}
			if (el.classList.contains('has-folder-note')) {
				if (plugin instanceof FolderNotesPlugin) {
					const folderNote = getFolderNote(plugin, folderItem.path);
					if (folderNote) { folderOverview.pathBlacklist.push(folderNote.path); }
				}
			}
		});

		const DEBOUNCE_DELAY_MS = 300;
		const debouncedRenderFileExplorer = debounce(
			() => this.renderFileExplorer(),
			DEBOUNCE_DELAY_MS,
		);

		const handleVaultChange = (): void => {
			debouncedRenderFileExplorer();
		};

		this.eventListeners.push(() => {
			folderOverview.off('vault-change', handleVaultChange);
		});

		folderOverview.on('vault-change', handleVaultChange);

		if (tFolder instanceof TFolder) {
			await this.addFiles(tFolder.children, overviewList, folderOverview, sourceFolderPath);
		}

		newFolderElement.querySelectorAll('div.tree-item-icon').forEach((el) => {
			if (el instanceof HTMLElement) {
				el.onclick = (): void => {
					const path = el.parentElement?.getAttribute('data-path');
					if (!path) return;
					const targetFolder = plugin.app.vault.getAbstractFileByPath(path);
					this.handleCollapseClick(
						el, plugin, yaml, this.pathBlacklist,
						sourceFolderPath, folderOverview, targetFolder,
					);
				};
			}
		});
	}

	async addFiles(
		files: TAbstractFile[],
		childrenElement: HTMLElement,
		folderOverview: FolderOverview,
		sourceFolderPath: string,
	): Promise<void> {
		const { plugin } = folderOverview;
		const allFiles = await filterFiles(
			files,
			plugin,
			sourceFolderPath,
			folderOverview.yaml.depth,
			folderOverview.pathBlacklist,
			folderOverview.yaml,
			folderOverview.sourceFile
		);
		const sortedFiles = sortFiles(
			(allFiles ?? []).filter((file): file is TAbstractFile => file !== null),
			folderOverview.yaml,
			folderOverview.plugin
		);

		const folders = sortedFiles.filter((child) => child instanceof TFolder);
		const otherFiles = sortedFiles.filter((child) => child instanceof TFile);

		for (const child of folders) {
			if (!(child instanceof TFolder)) continue;
			await this.createFolderEL(
				plugin, child, folderOverview, childrenElement, sourceFolderPath,
			);
		}

		for (const child of otherFiles) {
			if (!(child instanceof TFile)) continue;
			await this.createFileEL(plugin, child, folderOverview, childrenElement);
		}
	}

	async handleCollapseClick(
		el: HTMLElement,
		plugin: FolderOverviewPlugin | FolderNotesPlugin,
		yaml: defaultOverviewSettings,
		pathBlacklist: string[],
		sourceFolderPath: string,
		folderOverview: FolderOverview,
		folder?: TFolder | undefined | null | TAbstractFile,
	): Promise<void> {
		el.classList.toggle('is-collapsed');
		if (el.classList.contains('is-collapsed')) {
			if (!(folder instanceof TFolder)) return;
			folder.collapsed = true;
			el.parentElement?.parentElement?.childNodes[1]?.remove();
		} else {
			if (!(folder instanceof TFolder)) return;
			folder.collapsed = false;
			const folderElement = el.parentElement?.parentElement;
			if (!folderElement) return;
			const childrenElement = folderElement.createDiv({
				cls: 'tree-item-children nav-folder-children',
			});
			const files = sortFiles(folder.children, yaml, plugin);
			const filteredFilesResult = await filterFiles(
				files, plugin, folder.path,
				yaml.depth || 1, pathBlacklist,
				yaml, folderOverview.sourceFile,
			);
			const filteredFiles = (filteredFilesResult ?? [])
				.filter((file): file is TAbstractFile => file !== null);
			await this.addFiles(filteredFiles, childrenElement, folderOverview, sourceFolderPath);
		}
	}

	async createFolderEL(
		plugin: FolderOverviewPlugin | FolderNotesPlugin,
		child: TFolder,
		folderOverview: FolderOverview,
		childrenElement: HTMLElement,
		sourceFolderPath: string,
	): Promise<void> {
		const folderNote = this.getFolderNoteIfExists(plugin, child);
		if (folderNote) {
			folderOverview.pathBlacklist.push(folderNote.path);
		}

		if (this.shouldExcludeFolder(plugin, child)) {
			return;
		}

		const { folderElement, folderTitle } = this.createFolderElements(
			plugin, child, folderOverview, childrenElement, folderNote,
		);

		await this.handleFolderChildren(
			child, folderOverview, folderElement, folderTitle, childrenElement, sourceFolderPath,
		);

		this.setupFolderStyles(folderNote, child, folderTitle, folderOverview.yaml);
		this.createCollapseIcon(folderTitle, child, plugin, folderOverview, sourceFolderPath);
	}

	private getFolderNoteIfExists(
		plugin: FolderOverviewPlugin | FolderNotesPlugin,
		child: TFolder,
	): TFile | null | undefined {
		if (plugin instanceof FolderNotesPlugin) {
			return getFolderNote(plugin, child.path);
		}
		return undefined;
	}

	private shouldExcludeFolder(
		plugin: FolderOverviewPlugin | FolderNotesPlugin,
		child: TFolder,
	): boolean {
		if (plugin instanceof FolderNotesPlugin) {
			const excludedFolder = getExcludedFolder(plugin, child.path, true);
			return excludedFolder?.excludeFromFolderOverview ?? false;
		}
		return false;
	}

	private createFolderElements(
		plugin: FolderOverviewPlugin | FolderNotesPlugin,
		child: TFolder,
		folderOverview: FolderOverview,
		childrenElement: HTMLElement,
		folderNote: TFile | null | undefined,
	): { folderElement: HTMLElement | null, folderTitle: HTMLElement | null } {
		const { yaml } = folderOverview;

		if (!yaml.includeTypes.includes('folder')) {
			return { folderElement: null, folderTitle: null };
		}

		folderOverview.el.parentElement?.classList.add('fv-remove-edit-button');

		const folderElement = childrenElement.createDiv({
			cls: 'tree-item nav-folder',
		});

		const folderTitle = folderElement.createDiv({
			cls: 'tree-item-self is-clickable nav-folder-title',
			attr: {
				'data-path': child.path,
			},
		});

		this.setupFolderTitle(plugin, child, folderOverview, folderTitle, folderNote);

		return { folderElement, folderTitle };
	}

	private async setupFolderTitle(
		plugin: FolderOverviewPlugin | FolderNotesPlugin,
		child: TFolder,
		folderOverview: FolderOverview,
		folderTitle: HTMLElement,
		folderNote: TFile | null | undefined,
	): Promise<void> {
		const { yaml, pathBlacklist } = folderOverview;

		let folderName = child.name;
		if (yaml.fmtpIntegration && plugin instanceof FolderNotesPlugin && folderNote) {
			folderName = await plugin.fmtpHandler?.getNewFileName(folderNote) ?? child.name;
		}

		const folderTitleText = folderTitle.createDiv({
			cls: 'tree-item-inner nav-folder-title-content',
			text: folderName,
		});

		if (!folderNote) {
			folderTitleText.onclick = (): void => {
				const collapseIcon = folderTitle.querySelectorAll('.tree-item-icon')[0];
				if (collapseIcon) {
					this.handleCollapseClick(
						collapseIcon as HTMLElement, plugin, yaml, pathBlacklist,
						'', folderOverview, child,
					);
				}
			};
		}

		if (yaml.allowDragAndDrop) {
			this.handleDragAndDrop(folderTitle, folderTitle.parentElement as HTMLElement, child);
		}

		folderTitle.oncontextmenu = (e): void => {
			folderOverview.folderMenu(child, e);
		};
	}

	private async handleFolderChildren(
		child: TFolder,
		folderOverview: FolderOverview,
		folderElement: HTMLElement | null,
		folderTitle: HTMLElement | null,
		childrenElement: HTMLElement,
		sourceFolderPath: string,
	): Promise<void> {
		const { yaml } = folderOverview;

		if (!child.collapsed || !yaml.includeTypes.includes('folder')) {
			if (yaml.alwaysCollapse) {
				child.collapsed = true;
			}

			if (yaml.includeTypes.includes('folder')) {
				folderTitle?.classList.remove('is-collapsed');
				const folderChildren = folderElement?.createDiv({
					cls: 'tree-item-children nav-folder-children',
				});
				if (folderChildren) {
					await this.addFiles(
						child.children, folderChildren, folderOverview, sourceFolderPath,
					);
				}
			} else {
				await this.addFiles(
					child.children, childrenElement, folderOverview, sourceFolderPath,
				);
			}
		} else {
			folderTitle?.classList.add('is-collapsed');
		}
	}

	private setupFolderStyles(
		folderNote: TFile | null | undefined,
		child: TFolder,
		folderTitle: HTMLElement | null,
		yaml: defaultOverviewSettings,
	): void {
		if (folderNote) {
			folderTitle?.classList.add('has-folder-note');
		}

		if (folderNote && child.children.length === 1 && yaml.disableCollapseIcon) {
			folderTitle?.classList.add('fn-has-no-files');
		}
	}

	private createCollapseIcon(
		folderTitle: HTMLElement | null,
		child: TFolder,
		plugin: FolderOverviewPlugin | FolderNotesPlugin,
		folderOverview: FolderOverview,
		sourceFolderPath: string,
	): void {
		const collapseIcon = folderTitle?.createDiv({
			// eslint-disable-next-line max-len
			cls: 'tree-item-icon collapse-icon nav-folder-collapse-indicator fn-folder-overview-collapse-icon',
		});

		if (child.collapsed) {
			collapseIcon?.classList.add('is-collapsed');
		}

		if (collapseIcon) {
			setIcon(collapseIcon, 'chevron-down');
			collapseIcon.querySelector('path')?.setAttribute('d', 'M3 8L12 17L21 8');
			collapseIcon.onclick = (): void => {
				this.handleCollapseClick(
					collapseIcon, plugin, folderOverview.yaml, folderOverview.pathBlacklist,
					sourceFolderPath, folderOverview, child,
				);
			};
		}
	}

	handleDragAndDrop(
		folderTitle: HTMLElement,
		folderElement: HTMLElement | null,
		child: TFolder,
	): void {
		folderTitle.draggable = true;
		folderTitle.addEventListener('dragstart', (e) => {
			const { dragManager } = this.plugin.app;
			const dragData = dragManager.dragFolder(e, child);
			dragManager.onDragStart(e, dragData);
			folderTitle?.classList.add('is-being-dragged');
		});

		folderTitle.addEventListener('dragend', () => {
			folderTitle?.classList.remove('is-being-dragged');
		});

		folderTitle.addEventListener('dragover', (e) => {
			e.preventDefault();
			const { draggable } = this.plugin.app.dragManager;
			if (draggable) {
				folderElement?.classList.add('is-being-dragged-over');
				this.plugin.app.dragManager.setAction(
					window.i18next.t('interface.drag-and-drop.move-into-folder',
						{ folder: child.name }),
				);
			}
		});

		folderTitle.addEventListener('dragleave', () => {
			folderElement?.classList.remove('is-being-dragged-over');
		});

		folderTitle.addEventListener('drop', () => {
			const { draggable } = this.plugin.app.dragManager;
			if (draggable && draggable.file) {
				const newPath = child.path + '/' + draggable.file.name;
				this.plugin.app.fileManager.renameFile(draggable.file, newPath);
			}
		});
	}

	async createFileEL(
		plugin: FolderOverviewPlugin | FolderNotesPlugin,
		child: TFile,
		folderOverview: FolderOverview,
		childrenElement: HTMLElement,
	): Promise<void> {
		const { yaml } = folderOverview;
		const { pathBlacklist } = folderOverview;

		if (pathBlacklist.includes(child.path) && !yaml.showFolderNotes) { return; }

		folderOverview.el.parentElement?.classList.add('fv-remove-edit-button');

		const fileElement = childrenElement.createDiv({
			cls: 'tree-item nav-file',
		});

		const fileTitle = fileElement.createDiv({
			cls: 'tree-item-self is-clickable nav-file-title pointer-cursor',
			attr: {
				'data-path': child.path,
			},
		});

		if (yaml.allowDragAndDrop) {
			fileTitle.draggable = true;
			fileTitle.addEventListener('dragstart', (e) => {
				const dragManager = plugin.app.dragManager;
				const dragData = dragManager.dragFile(e, child);
				dragManager.onDragStart(e, dragData);
				fileTitle.classList.add('is-being-dragged');
			});

			fileTitle.addEventListener('dragend', () => {
				fileTitle.classList.remove('is-being-dragged');
			});

			fileTitle.addEventListener('dragover', (e) => {
				e.preventDefault();
				const { draggable } = plugin.app.dragManager;
				if (draggable) {
					const folderName = child.parent?.name || plugin.app.vault.getName();
					plugin.app.dragManager.setAction(
						window.i18next.t('interface.drag-and-drop.move-into-folder',
							{ folder: folderName }),
					);
					fileElement.parentElement?.parentElement?.classList
						.add('is-being-dragged-over');
				}
			});

			fileTitle.addEventListener('dragleave', () => {
				fileElement.parentElement?.parentElement?.classList.remove('is-being-dragged-over');
			});

			fileTitle.addEventListener('drop', (e) => {
				e.preventDefault();
				const { draggable } = plugin.app.dragManager;
				if (draggable?.file) {
					const targetFolder = child.parent?.path || '';
					if (targetFolder) {
						const newPath = `${targetFolder}/${draggable.file.name}`;
						plugin.app.fileManager.renameFile(draggable.file, newPath);
					}
					fileElement.parentElement?.parentElement?.classList
						.remove('is-being-dragged-over');
				}
			});
		}

		fileTitle.onclick = (): void => {
			plugin.app.workspace.openLinkText(child.path, child.path, true);
		};

		fileTitle.oncontextmenu = (e): void => {
			folderOverview.fileMenu(child, e);
		};

		let fileName = child.basename;
		if (yaml.fmtpIntegration) {
			fileName = await plugin.fmtpHandler?.getNewFileName(child) ?? child.basename;
		}

		fileTitle.createDiv({
			cls: 'tree-item-inner nav-file-title-content',
			text: fileName,
		});

		if (child.extension !== 'md' && !yaml.disableFileTag) {
			fileTitle.createDiv({
				cls: 'nav-file-tag',
				text: child.extension,
			});
		}
	}
}
