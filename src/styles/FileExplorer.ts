import { MarkdownPostProcessorContext, TAbstractFile, TFolder, TFile, setIcon } from 'obsidian';
import { getFolderNote } from '../../../functions/folderNoteFunctions';
import { getExcludedFolder } from '../../../ExcludeFolders/functions/folderFunctions';
import { getFolderPathFromString } from '../../../functions/utils';
import { getFileExplorerElement } from '../../../functions/styleFunctions';
import { FolderOverview, defaultOverviewSettings, sortFiles, filterFiles } from '../FolderOverview';
import FolderOverviewPlugin from '../main';
import FolderNotesPlugin from '../../../main';

export class FileExplorerOverview {
	plugin: FolderOverviewPlugin | FolderNotesPlugin;
	folderOverview: FolderOverview;
	pathBlacklist: string[];
	source: string;
	yaml: defaultOverviewSettings;
	root: HTMLElement;

	eventListeners: (() => void)[] = [];
	constructor(plugin: FolderOverviewPlugin | FolderNotesPlugin, ctx: MarkdownPostProcessorContext, root: HTMLElement, yaml: defaultOverviewSettings, pathBlacklist: string[], folderOverview: FolderOverview) {
		this.plugin = plugin;
		this.folderOverview = folderOverview;
		this.pathBlacklist = pathBlacklist;
		this.source = ctx.sourcePath;
		this.yaml = yaml;
		this.root = root;
	}

	disconnectListeners() {
		this.eventListeners.forEach((unregister) => {
			unregister();
		});
		this.eventListeners = [];
	}

	async renderFileExplorer() {
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
				tFolder = plugin.app.vault.getAbstractFileByPath(getFolderPathFromString(ctx.sourcePath));
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
			const folder = plugin.app.vault.getAbstractFileByPath(el.getAttribute('data-path') || '');
			if (!(folder instanceof TFolder)) return;

			if (yaml.alwaysCollapse) {
				folder.collapsed = true;
				el.classList.add('is-collapsed');
			} else {
				if (yaml.storeFolderCondition) {
					if (folder.collapsed) {
						el.classList.add('is-collapsed');
					} else {
						el.classList.remove('is-collapsed');
					}
				} else {
					if (el.parentElement?.classList.contains('is-collapsed')) {
						folder.collapsed = true;
					} else {
						folder.collapsed = false;
					}
				}
			}

			if (el.classList.contains('has-folder-note')) {
				if (plugin instanceof FolderNotesPlugin) {
					const folderNote = getFolderNote(plugin, folder.path);
					if (folderNote) { folderOverview.pathBlacklist.push(folderNote.path); }
				}
			}
		});

		const debouncedRenderFileExplorer = this.debounce(() => this.renderFileExplorer(), 300);

		const handleVaultChange = () => {
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
				el.onclick = () => {
					const path = el.parentElement?.getAttribute('data-path');
					if (!path) return;
					const folder = plugin.app.vault.getAbstractFileByPath(path);
					this.handleCollapseClick(el, plugin, yaml, this.pathBlacklist, sourceFolderPath, folderOverview, folder);
				};
			}
		});
	}

	debounce(func: Function, wait: number) {
		let timeout: number | undefined;
		return (...args: any[]) => {
			clearTimeout(timeout);
			timeout = window.setTimeout(() => func.apply(this, args), wait);
		};
	}

	async addFiles(files: TAbstractFile[], childrenElement: HTMLElement, folderOverview: FolderOverview, sourceFolderPath: string) {
		const plugin = folderOverview.plugin;
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
			await this.createFolderEL(plugin, child, folderOverview, childrenElement, sourceFolderPath);
		}

		for (const child of otherFiles) {
			if (!(child instanceof TFile)) continue;
			await this.createFileEL(plugin, child, folderOverview, childrenElement);
		}

	}

	async handleCollapseClick(el: HTMLElement, plugin: FolderOverviewPlugin | FolderNotesPlugin, yaml: defaultOverviewSettings, pathBlacklist: string[], sourceFolderPath: string, folderOverview: FolderOverview, folder?: TFolder | undefined | null | TAbstractFile) {
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
			const childrenElement = folderElement.createDiv({ cls: 'tree-item-children nav-folder-children' });
			const files = sortFiles(folder.children, yaml, plugin);
			const filteredFiles = (await filterFiles(files, plugin, folder.path, yaml.depth || 1, pathBlacklist, yaml, folderOverview.sourceFile) ?? []).filter((file): file is TAbstractFile => file !== null);
			await this.addFiles(filteredFiles, childrenElement, folderOverview, sourceFolderPath);
		}
	}

	async createFolderEL(plugin: FolderOverviewPlugin | FolderNotesPlugin, child: TFolder, folderOverview: FolderOverview, childrenElement: HTMLElement, sourceFolderPath: string) {
		const pathBlacklist = folderOverview.pathBlacklist;
		let folderNote: TFile | null | undefined = undefined;
		if (plugin instanceof FolderNotesPlugin) {
			folderNote = getFolderNote(plugin, child.path);
		}
		const yaml = folderOverview.yaml;
		let folderTitle: HTMLElement | null = null;
		let folderElement: HTMLElement | null = null;

		if (folderNote) { pathBlacklist.push(folderNote.path); }
		let excludedFolder = undefined;
		if (plugin instanceof FolderNotesPlugin) {
			excludedFolder = getExcludedFolder(plugin, child.path, true);
		}
		if (excludedFolder?.excludeFromFolderOverview) { return; }

		if (yaml.includeTypes.includes('folder')) {
			folderOverview.el.parentElement?.classList.add('fv-remove-edit-button');
			folderElement = childrenElement.createDiv({
				cls: 'tree-item nav-folder',
			});

			folderTitle = folderElement.createDiv({
				cls: 'tree-item-self is-clickable nav-folder-title',
				attr: {
					'data-path': child.path,
				},
			});

			let folderName = child.name;
			if (yaml.fmtpIntegration && plugin instanceof FolderNotesPlugin && folderNote) {
				folderName = await plugin.fmtpHandler?.getNewFileName(folderNote) ?? child.name;
			}

			const folderTitleText = folderTitle?.createDiv({
				cls: 'tree-item-inner nav-folder-title-content',
				text: folderName,
			});

			if (folderTitleText && !folderNote) {
				folderTitleText.onclick = () => {
					const collapseIcon = folderTitle?.querySelectorAll('.tree-item-icon')[0] as HTMLElement;
					if (collapseIcon) {
						this.handleCollapseClick(collapseIcon, plugin, yaml, pathBlacklist, sourceFolderPath, folderOverview, child);
					}
				};
			}

			if (yaml.allowDragAndDrop) {
				folderTitle.draggable = true;
				folderTitle.addEventListener('dragstart', (e) => {
					const dragManager = plugin.app.dragManager;
					const dragData = dragManager.dragFolder(e, child);
					dragManager.onDragStart(e, dragData);
					folderTitle?.classList.add('is-being-dragged');
				});

				folderTitle.addEventListener('dragend', (e) => {
					folderTitle?.classList.remove('is-being-dragged');
				});

				folderTitle.addEventListener('dragover', (e) => {
					e.preventDefault();
					const { draggable } = plugin.app.dragManager;
					if (draggable) {
						folderElement?.classList.add('is-being-dragged-over');
						plugin.app.dragManager.setAction(window.i18next.t('interface.drag-and-drop.move-into-folder', { folder: child.name }));
					}

				});

				folderTitle.addEventListener('dragleave', (e) => {
					folderElement?.classList.remove('is-being-dragged-over');
				});

				folderTitle.addEventListener('drop', (e) => {
					const { draggable } = plugin.app.dragManager;
					if (draggable && draggable.file) {
						plugin.app.fileManager.renameFile(draggable.file, child.path + '/' + draggable.file.name);
					}
				});
			}

			folderTitle.oncontextmenu = (e) => {
				folderOverview.folderMenu(child, e);
			};
		}

		if (!child.collapsed || !yaml.includeTypes.includes('folder')) {
			if (yaml.alwaysCollapse) {
				child.collapsed = true;
			}
			if (yaml.includeTypes.includes('folder')) {
				folderTitle?.classList.remove('is-collapsed');
				const childrenElement = folderElement?.createDiv({ cls: 'tree-item-children nav-folder-children' });
				if (childrenElement) {
					await this.addFiles(child.children, childrenElement, folderOverview, sourceFolderPath);
				}
			} else {
				await this.addFiles(child.children, childrenElement, folderOverview, sourceFolderPath);
			}
		} else {
			folderTitle?.classList.add('is-collapsed');
		}

		if (folderNote) { folderTitle?.classList.add('has-folder-note'); }
		if (folderNote && child.children.length === 1 && yaml.disableCollapseIcon) { folderTitle?.classList.add('fn-has-no-files'); }

		const collapseIcon = folderTitle?.createDiv({
			cls: 'tree-item-icon collapse-icon nav-folder-collapse-indicator fn-folder-overview-collapse-icon',
		});

		if (child.collapsed) {
			collapseIcon?.classList.add('is-collapsed');
		}

		if (collapseIcon) {
			setIcon(collapseIcon, 'chevron-down');
			collapseIcon.querySelector('path')?.setAttribute('d', 'M3 8L12 17L21 8');
			collapseIcon.onclick = () => {
				this.handleCollapseClick(collapseIcon, plugin, yaml, pathBlacklist, sourceFolderPath, folderOverview, child);
			};
		}
	}

	async createFileEL(plugin: FolderOverviewPlugin | FolderNotesPlugin, child: TFile, folderOverview: FolderOverview, childrenElement: HTMLElement) {
		const yaml = folderOverview.yaml;
		const pathBlacklist = folderOverview.pathBlacklist;

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
					plugin.app.dragManager.setAction(window.i18next.t('interface.drag-and-drop.move-into-folder', { folder: child.parent?.name || plugin.app.vault.getName() }));
					fileElement.parentElement?.parentElement?.classList.add('is-being-dragged-over');

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
						plugin.app.fileManager.renameFile(draggable.file, `${targetFolder}/${draggable.file.name}`);
					}
					fileElement.parentElement?.parentElement?.classList.remove('is-being-dragged-over');
				}
			});
		}

		fileTitle.onclick = () => {
			plugin.app.workspace.openLinkText(child.path, child.path, true);
		};

		fileTitle.oncontextmenu = (e) => {
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
